-- ============================================================================
--  Cadence — multi-tenant schema
--  Safe to run repeatedly (idempotent). Run in Supabase → SQL Editor.
--
--  Core idea: EVERY row belongs to an organization (a customer studio), and
--  Row-Level Security means the database itself refuses to return another
--  organization's data — even if someone bypasses the app.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ─── Organizations (one per paying customer studio) ─────────────────────────
create table if not exists organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text unique,
  plan                text not null default 'trial',      -- trial | starter | studio | enterprise
  status              text not null default 'active',     -- active | past_due | suspended | cancelled
  seats               integer not null default 5,
  trial_ends_at       timestamptz default (now() + interval '14 days'),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  settings            jsonb not null default '{}'::jsonb, -- fiscal year, working hours, logo, etc.
  created_at          timestamptz not null default now()
);

-- ─── Profiles (one per auth user; a user can belong to several orgs) ────────
create table if not exists profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  full_name      text,
  avatar_url     text,
  platform_admin boolean not null default false,   -- YOU (the vendor). Grants the admin console.
  created_at     timestamptz not null default now()
);

-- ─── Memberships (user ↔ org, with role + granular permissions) ────────────
create table if not exists memberships (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  user_id           uuid references auth.users(id) on delete cascade,
  email             text,                                  -- kept for pending/unclaimed seats
  display_name      text,
  role              text not null default 'member',        -- owner | admin | manager | member | tracker | finance | viewer
  permissions       text[] not null default '{}',          -- extra grants on top of the role preset
  status            text not null default 'active',        -- active | invited | suspended
  job_title         text,
  teams             text[],
  hourly_rate       numeric,
  holiday_allowance integer default 30,
  daily_hours       numeric default 8,
  created_at        timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_org_idx  on memberships(org_id);
create index if not exists memberships_user_idx on memberships(user_id);

-- ─── Invites (email invitations to join an org) ────────────────────────────
create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member',
  permissions text[] not null default '{}',
  token       text not null unique default encode(gen_random_bytes(24),'hex'),
  invited_by  uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists invites_org_idx   on invites(org_id);
create index if not exists invites_email_idx on invites(lower(email));

-- ─── Product tables (all org-scoped) ───────────────────────────────────────
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, color text, payment_terms integer default 30,
  billing_address text, created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  code text, name text not null, billing text default 'perday',
  cost numeric default 0, phases jsonb not null default '[]'::jsonb,
  archived boolean not null default false, created_at timestamptz not null default now()
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null default 'work',                    -- work | leave | task
  membership_id uuid references memberships(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  phase_id text, task_id uuid, leave_type text,
  start_date date not null, end_date date not null,
  start_time text, end_time text, lane integer,
  mode text, value numeric, note text,
  created_at timestamptz not null default now()
);

create table if not exists time_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  membership_id uuid references memberships(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  phase_id text, task_id uuid,
  log_date date not null, minutes integer not null default 0,
  source text default 'manual', note text,
  created_at timestamptz not null default now()
);
create index if not exists time_logs_org_date_idx on time_logs(org_id, log_date);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null, notes text,
  assignee_id uuid references memberships(id) on delete set null,
  project_id uuid references projects(id) on delete set null, phase_id text,
  team text, priority text default 'med', status text default 'todo',
  ord double precision default 0, created_at timestamptz not null default now()
);

create table if not exists billing_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,                                   -- pipeline | overhead | invoice | expense
  title text, client text, amount numeric default 0, status text,
  entry_date date, project_id uuid references projects(id) on delete set null,
  membership_id uuid references memberships(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public_holidays (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  day date not null, name text
);

-- ─── Audit log (who did what — expected in team products) ──────────────────
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null, entity text, entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_org_idx on audit_log(org_id, created_at desc);

-- ============================================================================
--  Helper functions used by the security policies
-- ============================================================================
create or replace function app_is_platform_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select platform_admin from profiles where id = auth.uid()), false)
$$;

create or replace function app_is_member(o uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = o and m.user_id = auth.uid() and m.status = 'active'
  ) or app_is_platform_admin()
$$;

-- Role presets are expanded here so the database enforces the same rules as the UI.
create or replace function app_has(o uuid, perm text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from memberships m
    where m.org_id = o and m.user_id = auth.uid() and m.status = 'active'
      and (
        m.role in ('owner','admin')
        or perm = any(m.permissions)
        or (m.role = 'manager' and perm in (
              'schedule.view','schedule.edit','summary.view','summary.edit',
              'projects.manage','clients.manage','tasks.view','tasks.edit',
              'time.track','time.manual','team.view'))
        or (m.role = 'finance' and perm in (
              'billing.view','billing.edit','summary.view','schedule.view','team.view'))
        or (m.role = 'member' and perm in (
              'schedule.view','summary.view','tasks.view','tasks.edit',
              'time.track','time.manual','team.view'))
        or (m.role = 'tracker' and perm in ('time.track','schedule.view'))
        or (m.role = 'viewer'  and perm in ('schedule.view','summary.view','tasks.view'))
      )
  ) or app_is_platform_admin()
$$;

-- ============================================================================
--  Row-Level Security
-- ============================================================================
alter table organizations   enable row level security;
alter table profiles        enable row level security;
alter table memberships     enable row level security;
alter table invites         enable row level security;
alter table clients         enable row level security;
alter table projects        enable row level security;
alter table assignments     enable row level security;
alter table time_logs       enable row level security;
alter table tasks           enable row level security;
alter table billing_entries enable row level security;
alter table public_holidays enable row level security;
alter table audit_log       enable row level security;

-- profiles: you can see/edit only yourself (platform admins see all)
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for select using (id = auth.uid() or app_is_platform_admin());
drop policy if exists profiles_upd on profiles;
create policy profiles_upd on profiles for update using (id = auth.uid());
drop policy if exists profiles_ins on profiles;
create policy profiles_ins on profiles for insert with check (id = auth.uid());

-- organizations: members can read their own org; owners/admins can update it
drop policy if exists org_read on organizations;
create policy org_read on organizations for select using (app_is_member(id));
drop policy if exists org_update on organizations;
create policy org_update on organizations for update using (app_has(id,'org.admin'));
drop policy if exists org_insert on organizations;
create policy org_insert on organizations for insert with check (auth.uid() is not null);

-- memberships: read within your org; manage requires team.manage
drop policy if exists mem_read on memberships;
create policy mem_read on memberships for select using (app_is_member(org_id) or user_id = auth.uid());
drop policy if exists mem_write on memberships;
create policy mem_write on memberships for all
  using (app_has(org_id,'team.manage') or user_id = auth.uid())
  with check (app_has(org_id,'team.manage') or user_id = auth.uid());

-- invites: manageable by team managers; readable by the invitee via token lookup (server-side)
drop policy if exists inv_rw on invites;
create policy inv_rw on invites for all
  using (app_has(org_id,'team.manage')) with check (app_has(org_id,'team.manage'));

-- Generic per-table policies: read = any member, write = specific permission
drop policy if exists clients_read on clients;
create policy clients_read on clients for select using (app_is_member(org_id));
drop policy if exists clients_write on clients;
create policy clients_write on clients for all
  using (app_has(org_id,'clients.manage')) with check (app_has(org_id,'clients.manage'));

drop policy if exists projects_read on projects;
create policy projects_read on projects for select using (app_is_member(org_id));
drop policy if exists projects_write on projects;
create policy projects_write on projects for all
  using (app_has(org_id,'projects.manage')) with check (app_has(org_id,'projects.manage'));

drop policy if exists asg_read on assignments;
create policy asg_read on assignments for select using (app_is_member(org_id));
drop policy if exists asg_write on assignments;
create policy asg_write on assignments for all
  using (app_has(org_id,'schedule.edit')) with check (app_has(org_id,'schedule.edit'));

-- time logs: everyone with time.track may write THEIR OWN; summary.edit may edit anyone's
drop policy if exists tl_read on time_logs;
create policy tl_read on time_logs for select using (app_is_member(org_id));
drop policy if exists tl_write on time_logs;
create policy tl_write on time_logs for all
  using (
    app_has(org_id,'summary.edit')
    or (app_has(org_id,'time.track')
        and membership_id in (select id from memberships where org_id = time_logs.org_id and user_id = auth.uid()))
  )
  with check (
    app_has(org_id,'summary.edit')
    or (app_has(org_id,'time.track')
        and membership_id in (select id from memberships where org_id = time_logs.org_id and user_id = auth.uid()))
  );

drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select using (app_is_member(org_id));
drop policy if exists tasks_write on tasks;
create policy tasks_write on tasks for all
  using (app_has(org_id,'tasks.edit')) with check (app_has(org_id,'tasks.edit'));

-- billing is sensitive: reading it requires billing.view (not just membership)
drop policy if exists bill_read on billing_entries;
create policy bill_read on billing_entries for select using (app_has(org_id,'billing.view'));
drop policy if exists bill_write on billing_entries;
create policy bill_write on billing_entries for all
  using (app_has(org_id,'billing.edit')) with check (app_has(org_id,'billing.edit'));

drop policy if exists hol_read on public_holidays;
create policy hol_read on public_holidays for select using (app_is_member(org_id));
drop policy if exists hol_write on public_holidays;
create policy hol_write on public_holidays for all
  using (app_has(org_id,'org.admin')) with check (app_has(org_id,'org.admin'));

drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select using (app_has(org_id,'org.admin'));
drop policy if exists audit_write on audit_log;
create policy audit_write on audit_log for insert with check (app_is_member(org_id));

-- ============================================================================
--  Sign-up plumbing
-- ============================================================================
-- Create a profile row automatically whenever someone signs up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Create an organization and make the caller its owner, in one safe step.
create or replace function create_organization(org_name text, person_name text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into organizations (name, slug)
  values (org_name, lower(regexp_replace(org_name,'[^a-zA-Z0-9]+','-','g')) || '-' || substr(gen_random_uuid()::text,1,6))
  returning id into new_id;
  insert into memberships (org_id, user_id, email, display_name, role, status)
  values (new_id, auth.uid(), (select email from auth.users where id = auth.uid()),
          coalesce(person_name,(select coalesce(full_name,email) from profiles where id=auth.uid())), 'owner','active');
  insert into audit_log(org_id,user_id,action,entity) values (new_id, auth.uid(), 'org.created','organization');
  return new_id;
end $$;

-- Accept an invite: claims the seat for the signed-in user.
create or replace function accept_invite(invite_token text)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv invites%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from invites where token = invite_token
    and accepted_at is null and expires_at > now();
  if not found then raise exception 'This invitation is invalid or has expired.'; end if;

  insert into memberships (org_id, user_id, email, role, permissions, status)
  values (inv.org_id, auth.uid(), inv.email, inv.role, inv.permissions, 'active')
  on conflict (org_id, user_id) do update
    set status='active', role=excluded.role, permissions=excluded.permissions;

  update invites set accepted_at = now() where id = inv.id;
  insert into audit_log(org_id,user_id,action,entity) values (inv.org_id, auth.uid(), 'invite.accepted','membership');
  return inv.org_id;
end $$;

-- Seat usage (used by the UI + billing limits)
create or replace function org_seat_usage(o uuid)
returns table(used integer, seats integer)
language sql stable security definer set search_path=public as $$
  select (select count(*)::int from memberships m where m.org_id=o and m.status in ('active','invited')),
         (select og.seats from organizations og where og.id=o)
$$;
