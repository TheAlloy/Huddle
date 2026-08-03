-- ============================================================
-- Huddle: make studio creators owners
-- Run this in Supabase → SQL Editor.
-- ============================================================

-- 1) Fix your existing account: set yourself as owner of your studio.
--    Replace the email below with the one you signed up with.
update memberships
set role = 'owner'
where user_id = (select id from auth.users where email = 'id@thealloy.com');

-- (Optional) If you have a few test studios and want the first
-- member of every owner-less studio promoted to owner, uncomment this:
-- update memberships m
-- set role = 'owner'
-- where m.org_id in (
--   select org_id from memberships group by org_id
--   having bool_or(role = 'owner') = false
-- )
-- and m.ctid = (
--   select m2.ctid from memberships m2
--   where m2.org_id = m.org_id
--   order by m2.ctid
--   limit 1
-- );

-- 2) Going forward: the FIRST person to join a studio (its creator)
--    is automatically made the owner. Invited members are unaffected,
--    because their studio already has members when they join.
create or replace function huddle_first_member_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from memberships where org_id = new.org_id) then
    new.role := 'owner';
    if new.status is null then
      new.status := 'active';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_huddle_first_member_owner on memberships;

create trigger trg_huddle_first_member_owner
before insert on memberships
for each row
execute function huddle_first_member_owner();
