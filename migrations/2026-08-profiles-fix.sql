-- ============================================================
-- Huddle: fix "memberships_user_id_fkey" error when joining a team
-- Cause: invited users had no row in "profiles" (which memberships.user_id
-- points to), so creating their membership was rejected.
-- Run this in Supabase → SQL Editor.
-- ============================================================

-- 1) Create a profile for every existing auth user that doesn't have one.
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 2) Automatically create a profile whenever anyone new signs up
--    (so invites and new sign-ups always work from now on).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
