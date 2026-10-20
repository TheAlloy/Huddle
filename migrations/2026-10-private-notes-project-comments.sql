-- ============================================================
-- Huddle: private notes + project-wide comments
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp),
-- BEFORE the matching app code goes live. Safe to run more than once.
--
-- 1. notes: each person's private, dated notebook. Only the author can see,
--    edit or delete their notes — owners and admins included. A note can
--    hang off a project (and phase/task), a booking, or a time entry, or
--    nothing at all.
-- 2. Comments become one team thread per project. Comments made on a
--    booking still belong to it, and now also to its project; a project can
--    take comments of its own. Deleting a booking keeps its comments in the
--    project's thread.
-- 3. Notes typed in the tracker used to sit on the time entry, where anyone
--    who can see timesheets could read them. They move into their authors'
--    private notes (linked to the same entry) and are cleared from
--    time_logs.
-- ============================================================

-- 1. Private notes ------------------------------------------------------
create table if not exists notes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  membership_id uuid not null references memberships(id) on delete cascade,  -- author
  project_id    uuid references projects(id) on delete set null,
  phase_id      text,
  task_id       uuid references tasks(id) on delete set null,
  assignment_id uuid references assignments(id) on delete set null,
  time_log_id   uuid references time_logs(id) on delete set null,
  body          text not null check (length(trim(body)) > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists notes_author_idx  on notes(membership_id, created_at desc);
create index if not exists notes_project_idx on notes(project_id);
create index if not exists notes_log_idx     on notes(time_log_id);

alter table notes enable row level security;

-- Author only, for everything: no permission (not even owner) reads them.
drop policy if exists notes_own on notes;
create policy notes_own on notes for all
  using (
    membership_id in (select id from memberships where org_id = notes.org_id and user_id = auth.uid())
  )
  with check (
    app_is_member(org_id)
    and membership_id in (select id from memberships where org_id = notes.org_id and user_id = auth.uid() and status = 'active')
  );

-- 2. Project-wide comments ---------------------------------------------
alter table assignment_comments add column if not exists project_id uuid references projects(id) on delete cascade;
alter table assignment_comments alter column assignment_id drop not null;
update assignment_comments c set project_id = a.project_id
  from assignments a where a.id = c.assignment_id and c.project_id is null;
-- A booking's comments outlive the booking (they stay in the project thread).
alter table assignment_comments drop constraint if exists assignment_comments_assignment_id_fkey;
alter table assignment_comments add constraint assignment_comments_assignment_id_fkey
  foreign key (assignment_id) references assignments(id) on delete set null;
create index if not exists assignment_comments_project_idx on assignment_comments(project_id);

-- 3. Tracker notes → private notes --------------------------------------
insert into notes (org_id, membership_id, project_id, phase_id, task_id, time_log_id, body, created_at, updated_at)
  -- dated by the entry itself: its day, at its start time (9:00 if it has none)
  select l.org_id, l.membership_id, l.project_id, l.phase_id, l.task_id, l.id, l.note,
         l.log_date + make_interval(mins => coalesce(l.start_min, 540)),
         l.log_date + make_interval(mins => coalesce(l.start_min, 540))
  from time_logs l
  where l.note is not null and length(trim(l.note)) > 0 and l.membership_id is not null
    and not exists (select 1 from notes n where n.time_log_id = l.id);
update time_logs set note = null where note is not null;

-- Let the API see the new table and column straight away.
notify pgrst, 'reload schema';
