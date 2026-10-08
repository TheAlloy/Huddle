-- ============================================================
-- Huddle: comments on schedule assignments
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp),
-- BEFORE the matching app code goes live. Safe to run more than once.
--
-- A shared thread on each piece of scheduled work: everyone in the studio
-- can read it and add their own comments; people delete their own, and
-- schedule editors can delete any.
-- ============================================================

create table if not exists assignment_comments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  assignment_id uuid not null references assignments(id) on delete cascade,
  membership_id uuid references memberships(id) on delete set null,   -- author
  body          text not null check (length(trim(body)) > 0),
  created_at    timestamptz not null default now()
);
create index if not exists assignment_comments_asg_idx on assignment_comments(assignment_id);
create index if not exists assignment_comments_org_idx on assignment_comments(org_id);

alter table assignment_comments enable row level security;

drop policy if exists ac_read on assignment_comments;
create policy ac_read on assignment_comments for select using (app_is_member(org_id));

-- You can only post as yourself, in a studio you belong to.
drop policy if exists ac_insert on assignment_comments;
create policy ac_insert on assignment_comments for insert
  with check (
    app_is_member(org_id)
    and membership_id in (select id from memberships where org_id = assignment_comments.org_id and user_id = auth.uid() and status = 'active')
  );

drop policy if exists ac_delete on assignment_comments;
create policy ac_delete on assignment_comments for delete
  using (
    membership_id in (select id from memberships where org_id = assignment_comments.org_id and user_id = auth.uid())
    or app_has(org_id, 'schedule.edit')
  );

notify pgrst, 'reload schema';
