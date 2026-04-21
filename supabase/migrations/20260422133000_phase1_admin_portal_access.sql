-- Phase 1 admin portal access (temporary permissive policy)
-- Fixes Supabase projects where `public.can_access_admin_portal()` is missing or migrations were not applied in order.
--
-- IMPORTANT (Phase 1):
-- - Any authenticated Supabase user can open `/admin` while this definition is deployed.
-- - Before production, replace this with the role-based implementation from `20260421130000_admin_portal_roles.sql`.

create or replace function public.can_access_admin_portal()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  staff_role_id uuid;
  jwt_email text;
begin
  if uid is null then
    return false;
  end if;

  -- If profile row is missing (common on older projects / missing triggers), create it now.
  if not exists (select 1 from public.users pu where pu.id = uid) then
    select r.id into staff_role_id from public.roles r where r.slug = 'staff' limit 1;

    jwt_email := nullif(trim(coalesce(auth.jwt() ->> 'email', '')), '');

    insert into public.users (id, email, display_name, role_id)
    values (
      uid,
      jwt_email,
      coalesce(nullif(split_part(jwt_email, '@', 1), ''), 'Staff'),
      staff_role_id
    )
    on conflict (id) do update
      set email = coalesce(excluded.email, public.users.email),
          display_name = coalesce(public.users.display_name, excluded.display_name);
  end if;

  return true;
end;
$$;

revoke all on function public.can_access_admin_portal() from public;
grant execute on function public.can_access_admin_portal() to authenticated;

-- Ensure Auth users always get a matching public.users profile row.
-- Keep profiles in sync when email changes, and backfill legacy auth users.
-- (Reuses the existing function name from core schema migrations.)

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role_id uuid;
begin
  select r.id into staff_role_id from public.roles r where r.slug = 'staff' limit 1;

  insert into public.users (id, email, display_name, role_id)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    staff_role_id
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(public.users.display_name, excluded.display_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profiles on auth.users;

create trigger on_auth_user_created_profiles
  after insert or update on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- Backfill: create missing public.users rows for existing auth users.
insert into public.users (id, email, display_name, role_id)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
    split_part(u.email, '@', 1)
  ),
  (select r.id from public.roles r where r.slug = 'staff' limit 1)
from auth.users u
where not exists (select 1 from public.users pu where pu.id = u.id)
on conflict (id) do nothing;
