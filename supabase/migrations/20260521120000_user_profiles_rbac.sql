-- User profiles + production RBAC (owner / manager / staff).
-- Extends existing auth; replaces Phase 1 permissive portal access.

-- ---------------------------------------------------------------------------
-- user_profiles (canonical role source for portal)
-- ---------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null check (role in ('owner', 'manager', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists user_profiles_role_idx on public.user_profiles (role);
create index if not exists user_profiles_active_idx on public.user_profiles (active) where active = true;

comment on table public.user_profiles is
  'Internal salon portal profiles — roles owner/manager/staff. No public self-signup provisioning.';

-- updated_at trigger
create or replace function public.trg_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_user_profiles_updated_at on public.user_profiles;
create trigger tr_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.trg_user_profiles_updated_at();

-- Backfill from legacy public.users + roles
insert into public.user_profiles (id, email, full_name, role, active, created_at, updated_at)
select
  u.id,
  coalesce(nullif(trim(u.email), ''), concat(u.id::text, '@internal.local')),
  nullif(trim(u.display_name), ''),
  case
    when r.slug in ('owner', 'admin') then 'owner'
    when r.slug = 'manager' then 'manager'
    else 'staff'
  end,
  u.is_active,
  u.created_at,
  u.updated_at
from public.users u
left join public.roles r on r.id = u.role_id
where not exists (select 1 from public.user_profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Keep public.users.role_id in sync when profile role changes (FK / audit compatibility)
create or replace function public.sync_users_from_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  select r.id into v_role_id
  from public.roles r
  where r.slug = case
    when new.role = 'owner' then 'owner'
    when new.role = 'manager' then 'manager'
    else 'staff'
  end
  limit 1;

  insert into public.users (id, email, display_name, role_id, is_active)
  values (new.id, new.email, new.full_name, v_role_id, new.active)
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users.display_name),
    role_id = coalesce(excluded.role_id, public.users.role_id),
    is_active = excluded.is_active,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists tr_sync_users_from_user_profile on public.user_profiles;
create trigger tr_sync_users_from_user_profile
  after insert or update on public.user_profiles
  for each row execute function public.sync_users_from_user_profile();

-- Auth hook: sync email only — do NOT auto-provision staff on signup
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set email = coalesce(new.email, email),
      updated_at = now()
  where id = new.id;

  update public.users
  set email = coalesce(new.email, email),
      updated_at = now()
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profiles on auth.users;
create trigger on_auth_user_created_profiles
  after insert or update on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Role helper functions (user_profiles)
-- ---------------------------------------------------------------------------
create or replace function public.is_salon_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'owner'
  );
$$;

create or replace function public.is_salon_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'manager'
  );
$$;

create or replace function public.is_salon_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role = 'staff'
  );
$$;

create or replace function public.is_salon_manager_or_above()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true and p.role in ('owner', 'manager')
  );
$$;

comment on function public.is_salon_owner() is 'Business owner — user management and full authority.';
comment on function public.is_salon_manager() is 'Operational manager tier.';
comment on function public.is_salon_staff() is 'Front-desk staff — sales/services/inventory read.';
comment on function public.is_salon_manager_or_above() is 'Owner or manager — settings, imports, corrections.';

grant execute on function public.is_salon_owner() to authenticated;
grant execute on function public.is_salon_manager() to authenticated;
grant execute on function public.is_salon_staff() to authenticated;
grant execute on function public.is_salon_manager_or_above() to authenticated;

-- Replace portal helpers to use user_profiles
create or replace function public.is_salon_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_salon_manager_or_above();
$$;

create or replace function public.is_salon_restricted_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_salon_staff();
$$;

-- Read-only: safe for middleware, RLS policies, and server component loads (no mutations).
create or replace function public.can_access_admin_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.role in ('owner', 'manager', 'staff')
  );
$$;

-- Write path: call only after explicit sign-in (not from access checks / RLS).
create or replace function public.record_portal_login()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.user_profiles
  set last_login_at = now()
  where id = auth.uid()
    and active = true
    and role in ('owner', 'manager', 'staff');
$$;

comment on function public.record_portal_login() is
  'Updates last_login_at after successful sign-in. Never call from read/access-check paths.';

grant execute on function public.record_portal_login() to authenticated;

-- Legacy is_staff_user — portal-active profiles only
create or replace function public.is_staff_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles p
    where p.id = auth.uid() and p.active = true
      and p.role in ('owner', 'manager', 'staff')
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: user_profiles
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_self_or_owner" on public.user_profiles;
create policy "user_profiles_select_self_or_owner"
  on public.user_profiles for select
  to authenticated
  using (id = auth.uid() or public.is_salon_owner());

drop policy if exists "user_profiles_insert_owner" on public.user_profiles;
create policy "user_profiles_insert_owner"
  on public.user_profiles for insert
  to authenticated
  with check (public.is_salon_owner());

drop policy if exists "user_profiles_update_owner" on public.user_profiles;
create policy "user_profiles_update_owner"
  on public.user_profiles for update
  to authenticated
  using (public.is_salon_owner())
  with check (public.is_salon_owner());

-- Owners cannot delete own profile via RLS (deactivate instead)
drop policy if exists "user_profiles_delete_owner" on public.user_profiles;
create policy "user_profiles_delete_owner"
  on public.user_profiles for delete
  to authenticated
  using (public.is_salon_owner() and id <> auth.uid());

-- Protect audit tables from delete (owner included — immutable history)
drop policy if exists "inventory_correction_log_no_delete" on public.inventory_correction_log;
create policy "inventory_correction_log_no_delete"
  on public.inventory_correction_log for delete
  to authenticated
  using (false);

drop policy if exists "inventory_import_batches_no_delete" on public.inventory_import_batches;
create policy "inventory_import_batches_no_delete"
  on public.inventory_import_batches for delete
  to authenticated
  using (false);

grant select, insert, update, delete on public.user_profiles to authenticated;

revoke all on function public.is_salon_portal_admin() from public;
revoke all on function public.is_salon_restricted_staff() from public;
revoke all on function public.can_access_admin_portal() from public;
grant execute on function public.is_salon_portal_admin() to authenticated;
grant execute on function public.is_salon_restricted_staff() to authenticated;
grant execute on function public.can_access_admin_portal() to authenticated;

-- Safety: ensure at least one owner exists after backfill (promotes earliest profile once).
do $$
begin
  if not exists (select 1 from public.user_profiles where role = 'owner' and active) then
    update public.user_profiles
    set role = 'owner'
    where id = (select id from public.user_profiles order by created_at asc limit 1);
  end if;
end $$;
