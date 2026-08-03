-- Feedback submissions (for the "1 month free" feedback prompt).
-- Run this in Supabase → SQL Editor.

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  email text,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table feedback enable row level security;

-- Active members can submit feedback for their own studio.
drop policy if exists feedback_insert on feedback;
create policy feedback_insert on feedback for insert
  with check (
    org_id in (select org_id from memberships where user_id = auth.uid() and status = 'active')
  );

-- The person can read their own; platform admins (the vendor) can read all.
drop policy if exists feedback_read on feedback;
create policy feedback_read on feedback for select
  using (
    user_id = auth.uid()
    or exists (select 1 from profiles where id = auth.uid() and platform_admin = true)
  );
