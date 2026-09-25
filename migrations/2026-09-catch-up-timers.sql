-- ============================================================
-- Huddle: catch-up for two August migrations the live database missed
-- Run this in Supabase → SQL Editor (project ewszodwpenvxjktcknfp).
-- Safe to run more than once.
--
-- Without these, every time entry that carries a time of day — timer
-- stops, calendar blocks, "Add time" — is rejected by the database
-- ("column start_min does not exist"), and the running timer can't be
-- stored server-side. Same content as:
--   migrations/2026-08-time-log-start.sql
--   migrations/2026-08-running-timers.sql
-- ============================================================

-- 1) Optional time-of-day placement for time logs (minutes from midnight;
--    null = duration-only entry).
alter table time_logs add column if not exists start_min integer;

-- 2) The running timer, one row per member, visible only to its owner.
create table if not exists running_timers (
  org_id uuid not null references organizations(id) on delete cascade,
  membership_id uuid primary key references memberships(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  phase_id text,
  task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table running_timers enable row level security;

drop policy if exists rt_self on running_timers;
create policy rt_self on running_timers for all
  using (
    app_has(org_id,'time.track')
    and membership_id in (select id from memberships where org_id = running_timers.org_id and user_id = auth.uid())
  )
  with check (
    app_has(org_id,'time.track')
    and membership_id in (select id from memberships where org_id = running_timers.org_id and user_id = auth.uid())
  );

-- Cross-device sync of your own timer (skipped if already enabled).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'running_timers') then
    alter publication supabase_realtime add table running_timers;
  end if;
end $$;

-- Make the API see the new column and table straight away.
notify pgrst, 'reload schema';
