-- Admin portal: owner / manager / staff + RPC for Next.js middleware / layouts
-- Run after 20260420100000_core_business_schema.sql

-- Owner tier (maps legacy admin users to owner)
insert into public.roles (slug, name, description)
values ('owner', 'Owner', 'Business owner — full portal and user management.')
on conflict (slug) do nothing;

update public.users u
set role_id = (select id from public.roles o where o.slug = 'owner' limit 1)
where u.role_id = (select id from public.roles a where a.slug = 'admin' limit 1);

-- Portal access: owner, manager, staff (excludes stylist/readonly; legacy admin still passes until migrated)
create or replace function public.can_access_admin_portal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.roles r on r.id = u.role_id
    where u.id = auth.uid()
      and u.is_active = true
      and r.slug in ('owner', 'manager', 'staff', 'admin')
  );
$$;

revoke all on function public.can_access_admin_portal() from public;
grant execute on function public.can_access_admin_portal() to authenticated;

-- Include owner in staff-style checks for RLS (inventory, sales, etc.)
create or replace function public.is_staff_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.roles r on r.id = u.role_id
    where u.id = auth.uid()
      and u.is_active = true
      and r.slug in ('owner', 'admin', 'manager', 'staff', 'stylist')
  );
$$;

-- Settings: owners and managers (not baseline staff)
drop policy if exists "settings_admin_insert" on public.settings;
create policy "settings_admin_insert"
  on public.settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists "settings_admin_update" on public.settings;
create policy "settings_admin_update"
  on public.settings for update
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug in ('owner', 'admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug in ('owner', 'admin', 'manager')
    )
  );

-- User directory management: owners (and legacy admin) only
drop policy if exists "users_admin_manage" on public.users;
create policy "users_admin_manage"
  on public.users for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug in ('owner', 'admin')
    )
  );
