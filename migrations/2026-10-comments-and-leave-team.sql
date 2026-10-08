-- ============================================================
-- Huddle: comments on schedule assignments + leaving a team
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp),
-- BEFORE the matching app code goes live. Safe to run more than once.
--
-- 1. A shared thread on each piece of scheduled work: everyone in the
--    studio can read it and add their own comments; people delete their
--    own, and schedule editors can delete any.
-- 2. leave_team(): Settings → "Leave this team". Marks your membership
--    'left' (never deletes it — deleting a membership cascades away that
--    person's logged time and schedule bars). The last owner can't leave.
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

-- 2) Leaving a team ------------------------------------------------------
create or replace function leave_team(o uuid)
returns void language plpgsql security definer set search_path=public as $$
declare m memberships%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into m from memberships where org_id = o and user_id = auth.uid();
  if not found then return; end if;
  if m.role = 'owner' and not exists (
    select 1 from memberships where org_id = o and role = 'owner' and status = 'active' and id <> m.id
  ) then
    raise exception 'You are the only owner of this team — make someone else an owner first.';
  end if;
  update memberships set status = 'left' where id = m.id;
  delete from running_timers where membership_id = m.id;
  insert into audit_log(org_id, user_id, action, entity) values (o, auth.uid(), 'member.left', 'membership');
end $$;

notify pgrst, 'reload schema';
