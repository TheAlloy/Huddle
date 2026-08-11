-- ============================================================
-- Security fix: stop members from escalating their own access.
-- Run this in Supabase → SQL Editor.
--
-- Before this fix the mem_write policy let any signed-in user write
-- their OWN membership row with no column restrictions, so anyone
-- could set their own role to 'owner' (or edit their permissions
-- array) with a direct API call, and could even INSERT themselves
-- into another studio if they learned its id.
--
-- After this fix:
--   * inserting membership rows requires team.manage in that studio
--     (org creation and invite acceptance are unaffected — they go
--     through security-definer functions, which this doesn't touch);
--   * role / permissions / status can only be changed by someone
--     with team.manage, and never on their own row;
--   * only an owner can grant the 'owner' role;
--   * org_id / user_id on a membership are immutable;
--   * self-service updates (display name, job title, hours, teams…)
--     keep working exactly as before.
-- ============================================================

-- 1) Replace the single catch-all policy with per-operation policies.
drop policy if exists mem_write on memberships;
drop policy if exists mem_ins on memberships;
drop policy if exists mem_upd on memberships;
drop policy if exists mem_del on memberships;

create policy mem_ins on memberships for insert
  with check (app_has(org_id,'team.manage'));

create policy mem_upd on memberships for update
  using (app_has(org_id,'team.manage') or user_id = auth.uid())
  with check (app_has(org_id,'team.manage') or user_id = auth.uid());

create policy mem_del on memberships for delete
  using (app_has(org_id,'team.manage') or user_id = auth.uid());

-- 2) Column-level guard. RLS can't restrict which columns an allowed
--    row-write may touch, so a trigger enforces that part.
create or replace function huddle_guard_membership_write()
returns trigger language plpgsql as $$
declare
  actor_is_manager boolean;
  actor_is_owner boolean;
begin
  -- Direct API writes from signed-in users run as 'authenticated'.
  -- The service role and security-definer functions (create_organization,
  -- accept_invite) run as other roles and are trusted as-is.
  if current_user not in ('authenticated','anon') then
    return new;
  end if;

  actor_is_manager := app_has(new.org_id,'team.manage');
  actor_is_owner := app_is_platform_admin() or exists (
    select 1 from memberships m
    where m.org_id = new.org_id and m.user_id = auth.uid()
      and m.role = 'owner' and m.status = 'active');

  if tg_op = 'UPDATE' then
    if new.org_id is distinct from old.org_id
       or new.user_id is distinct from old.user_id then
      raise exception 'A membership cannot be moved to another person or studio.';
    end if;
    if new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.status is distinct from old.status then
      if not actor_is_manager or old.user_id = auth.uid() then
        raise exception 'Only team managers can change roles, permissions or status — and not their own.';
      end if;
      if new.role = 'owner' and old.role is distinct from 'owner'
         and not actor_is_owner then
        raise exception 'Only an owner can make someone an owner.';
      end if;
    end if;
  elsif tg_op = 'INSERT' then
    if new.role = 'owner' and not actor_is_owner then
      raise exception 'Only an owner can make someone an owner.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_huddle_guard_membership_write on memberships;
create trigger trg_huddle_guard_membership_write
before insert or update on memberships
for each row execute function huddle_guard_membership_write();
