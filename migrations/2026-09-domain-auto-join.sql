-- ============================================================
-- Huddle: company-domain auto-join
-- Run this in Supabase → SQL Editor.
--
-- Anyone who signs in with a CONFIRMED email address on a listed
-- domain (e.g. @thealloy.com) is added straight into that domain's
-- studio with the listed role — no invite, no onboarding.
--
-- Safety: the address must be confirmed (magic link or confirmation
-- email), so keep "Confirm email" switched ON in Supabase → Auth →
-- Providers → Email. With it off, anyone could sign up as
-- someone@thealloy.com with a password and be let in.
-- ============================================================

-- 1) Which email domains map to which studio (and at what role).
create table if not exists org_domains (
  domain     text primary key,                -- lower-case, e.g. 'thealloy.com'
  org_id     uuid not null references organizations(id) on delete cascade,
  role       text not null default 'owner',   -- role given to people who auto-join
  created_at timestamptz not null default now()
);
alter table org_domains enable row level security;
-- Only the vendor (platform admin) can read or change the mapping directly;
-- join_domain_org() below reads it as security definer.
drop policy if exists org_domains_admin on org_domains;
create policy org_domains_admin on org_domains for all
  using (app_is_platform_admin()) with check (app_is_platform_admin());

-- 2) Called by the app after sign-in. Joins the caller to their domain's
--    studio if they aren't in it yet; returns that studio's id, or null
--    when their domain isn't listed / their email isn't confirmed.
--    Existing memberships are left alone (a suspended person stays suspended).
create or replace function join_domain_org()
returns uuid language plpgsql security definer set search_path=public as $$
declare u auth.users%rowtype; d org_domains%rowtype;
begin
  if auth.uid() is null then return null; end if;
  select * into u from auth.users where id = auth.uid();
  if u.email is null or u.email_confirmed_at is null then return null; end if;
  select * into d from org_domains where domain = lower(split_part(u.email, '@', 2));
  if not found then return null; end if;

  insert into memberships (org_id, user_id, email, display_name, role, status)
  values (d.org_id, u.id, u.email, nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ''), d.role, 'active')
  on conflict (org_id, user_id) do nothing;
  if found then
    insert into audit_log(org_id, user_id, action, entity) values (d.org_id, u.id, 'domain.joined', 'membership');
  end if;
  return d.org_id;
end $$;

-- 3) Point thealloy.com at The Alloy's studio — the studio owned by
--    id@thealloy.com. Check it's the right one first:
--      select o.id, o.name from organizations o
--      join memberships m on m.org_id = o.id
--      join auth.users u on u.id = m.user_id
--      where u.email = 'id@thealloy.com' and m.role = 'owner';
--    If that lists more than one studio, replace the select below with
--    the right id:  insert into org_domains (domain, org_id) values ('thealloy.com', '<studio id>');
insert into org_domains (domain, org_id, role)
select 'thealloy.com', m.org_id, 'owner'
from memberships m join auth.users u on u.id = m.user_id
where u.email = 'id@thealloy.com' and m.role = 'owner'
order by m.created_at
limit 1
on conflict (domain) do update set org_id = excluded.org_id, role = excluded.role;
