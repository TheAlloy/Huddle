-- ============================================================
-- Huddle: October 2026 changes
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp),
-- BEFORE the matching app code goes live. Safe to run more than once.
--
--   1. Roles: four roles — owner, admin ("Admin / Manager"), member,
--      tracker. Managers and Finance become Admin / Manager; Viewers
--      become Team members.
--   2. Clients get a free-text sector (Clients & Projects groups by it).
--   3. Tasks can have several assignees and a start date.
--   4. invite_info(): lets the invite page greet the invited person and
--      pre-fill their email (used by the "set a password and you're in"
--      invite flow, with api/invite-signup.js).
-- ============================================================

-- 1) Roles --------------------------------------------------------------
update memberships set role = 'admin'  where role in ('manager','finance');
update memberships set role = 'member' where role = 'viewer';
update invites     set role = 'admin'  where role in ('manager','finance');
update invites     set role = 'member' where role = 'viewer';

create or replace function app_has(o uuid, perm text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = o and m.user_id = auth.uid() and m.status = 'active'
      and (
        m.role in ('owner','admin')            -- admin = "Admin / Manager"
        or perm = any(m.permissions)
        or (m.role = 'member' and perm in (
              'schedule.view','summary.view','tasks.view','tasks.edit',
              'time.track','time.manual','team.view'))
        or (m.role = 'tracker' and perm in ('time.track','schedule.view'))
      )
  ) or app_is_platform_admin()
$$;

-- 2) Client sectors -----------------------------------------------------
alter table clients add column if not exists sector text;

-- 3) Tasks: several assignees + start date ------------------------------
alter table tasks add column if not exists assignee_ids uuid[] not null default '{}';
alter table tasks add column if not exists start_date date;
-- Existing single assignees carry over.
update tasks set assignee_ids = array[assignee_id]
where assignee_id is not null and (assignee_ids is null or cardinality(assignee_ids) = 0);

-- 4) Invite landing page ------------------------------------------------
create or replace function invite_info(invite_token text)
returns table(email text, org_name text)
language sql stable security definer set search_path=public as $$
  select i.email, o.name from invites i join organizations o on o.id = i.org_id
  where i.token = invite_token and i.accepted_at is null and i.expires_at > now()
$$;
grant execute on function invite_info(text) to anon, authenticated;

-- Make the API see the new columns and function straight away.
notify pgrst, 'reload schema';
