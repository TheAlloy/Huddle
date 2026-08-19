-- 2026-08: the running timer moves from localStorage into the database
-- (docs/time-tracker-plan.md, slice 3). One row per member; self-visible only —
-- manager visibility was explicitly deferred (audit doc §5, D6).

create table if not exists running_timers (
  org_id uuid not null references organizations(id) on delete cascade,
  membership_id uuid primary key references memberships(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  phase_id text,
  task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table running_timers enable row level security;

-- Members with time.track read and write only their own row.
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

-- Let clients subscribe to changes on their own timer (cross-device sync).
alter publication supabase_realtime add table running_timers;
