-- ============================================================
-- Huddle: invited people join their team on sign-in
-- Run in Supabase → SQL Editor (project ewszodwpenvxjktcknfp),
-- BEFORE the matching app code goes live. Safe to run more than once.
--
-- After signing in, the app calls accept_my_invites(): every open invite
-- sent to the person's email is accepted, so they land in the team even
-- if they signed up with email + password instead of clicking the link.
-- Only a CONFIRMED email counts (so keep "Confirm email" on in Supabase).
-- ============================================================

create or replace function accept_my_invites()
returns uuid language plpgsql security definer set search_path=public as $$
declare u auth.users%rowtype; inv invites%rowtype; joined uuid := null;
begin
  if auth.uid() is null then return null; end if;
  select * into u from auth.users where id = auth.uid();
  if u.email is null or u.email_confirmed_at is null then return null; end if;
  for inv in select * from invites
    where lower(email) = lower(u.email) and accepted_at is null and expires_at > now()
    order by created_at
  loop
    insert into memberships (org_id, user_id, email, display_name, role, permissions, status)
    values (inv.org_id, u.id, u.email, nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ''), inv.role, inv.permissions, 'active')
    on conflict (org_id, user_id) do update set status = 'active', role = excluded.role, permissions = excluded.permissions;
    update invites set accepted_at = now() where id = inv.id;
    insert into audit_log(org_id, user_id, action, entity) values (inv.org_id, u.id, 'invite.accepted', 'membership');
    joined := inv.org_id;
  end loop;
  return joined;
end $$;

notify pgrst, 'reload schema';
