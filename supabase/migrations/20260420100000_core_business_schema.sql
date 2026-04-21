-- Liberian Beauty Salon & Supplies — core business schema
-- Depends on: 20260419120000_booking_system.sql (services, stylists, stylist_services, bookings, create_booking_atomic)
-- Run migrations in timestamp order in Supabase SQL Editor or: supabase db push

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum ('draft', 'completed', 'voided', 'refunded');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'stock_movement_reason') then
    create type public.stock_movement_reason as enum (
      'purchase',
      'sale',
      'adjustment',
      'return_in',
      'return_out',
      'transfer',
      'initial',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Roles (application roles; not PostgreSQL roles)
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.roles is 'Application permission groups (admin, manager, stylist, etc.).';

insert into public.roles (slug, name, description)
values
  ('admin', 'Administrator', 'Full access to settings, users, inventory, and sales.'),
  ('manager', 'Manager', 'Operations: bookings, inventory, sales, reports.'),
  ('stylist', 'Stylist', 'Service calendar and assigned customer context.'),
  ('staff', 'Staff', 'Front desk / retail — POS and stock adjustments.'),
  ('readonly', 'Read only', 'Dashboards and exports without write access.')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Users — one profile row per Supabase Auth user (auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  phone text,
  role_id uuid references public.roles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.users is 'App profiles linked 1:1 to auth.users; use for staff login and admin.';

create index if not exists users_role_id_idx on public.users (role_id);
create index if not exists users_email_lower_idx on public.users (lower(email));

-- ---------------------------------------------------------------------------
-- Customers — CRM / POS guest records (optional link to app user)
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  name text not null,
  phone text,
  email text,
  notes text,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customers is 'Walk-in and booked guests; optional user_id when they create an account.';

create index if not exists customers_user_id_idx on public.customers (user_id);
create index if not exists customers_email_lower_idx on public.customers (lower(email));
create index if not exists customers_phone_idx on public.customers (phone);

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  website text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.suppliers is 'Vendors for inventory purchases and reorder context.';

create index if not exists suppliers_active_idx on public.suppliers (active) where active = true;

-- ---------------------------------------------------------------------------
-- Inventory items
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id) on delete set null,
  sku text unique,
  name text not null,
  description text,
  unit text not null default 'each',
  reorder_point numeric(14, 4) not null default 0,
  unit_cost_cents int,
  quantity_on_hand numeric(14, 4) not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_qty_non_negative check (quantity_on_hand >= 0)
);

comment on table public.inventory_items is 'Retail / supply SKUs; quantity_on_hand updated by stock_movements trigger.';

create index if not exists inventory_items_supplier_idx on public.inventory_items (supplier_id);
create index if not exists inventory_items_active_idx on public.inventory_items (active) where active = true;

-- ---------------------------------------------------------------------------
-- Stock movements (ledger) — drives quantity_on_hand
-- ---------------------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  quantity_change numeric(14, 4) not null,
  reason public.stock_movement_reason not null default 'other',
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.stock_movements is 'Append-only stock ledger; positive = in, negative = out.';

create index if not exists stock_movements_item_created_idx
  on public.stock_movements (inventory_item_id, created_at desc);

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty numeric(14, 4);
  next_qty numeric(14, 4);
begin
  select i.quantity_on_hand
    into strict current_qty
  from public.inventory_items i
  where i.id = new.inventory_item_id
  for update;

  next_qty := current_qty + new.quantity_change;

  if next_qty < 0 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  update public.inventory_items
  set
    quantity_on_hand = next_qty,
    updated_at = now()
  where id = new.inventory_item_id;

  return new;
end;
$$;

drop trigger if exists tr_stock_movements_apply on public.stock_movements;

create trigger tr_stock_movements_apply
  after insert on public.stock_movements
  for each row
  execute function public.apply_stock_movement();

-- ---------------------------------------------------------------------------
-- Sales (POS header)
-- ---------------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  status public.sale_status not null default 'completed',
  subtotal_cents int not null default 0,
  tax_cents int not null default 0,
  total_cents int not null default 0,
  currency text not null default 'LRD',
  payment_method text,
  sold_at timestamptz not null default now(),
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_subtotal_nonneg check (subtotal_cents >= 0),
  constraint sales_tax_nonneg check (tax_cents >= 0),
  constraint sales_total_nonneg check (total_cents >= 0)
);

comment on table public.sales is 'Retail / POS transactions; line items in sale_items.';

create index if not exists sales_customer_idx on public.sales (customer_id);
create index if not exists sales_sold_at_idx on public.sales (sold_at desc);
create index if not exists sales_status_idx on public.sales (status);

-- ---------------------------------------------------------------------------
-- Sale line items
-- ---------------------------------------------------------------------------
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  name text not null,
  quantity numeric(14, 4) not null,
  unit_price_cents int not null,
  line_total_cents int not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint sale_items_qty_positive check (quantity > 0),
  constraint sale_items_prices_nonneg check (unit_price_cents >= 0 and line_total_cents >= 0)
);

comment on table public.sale_items is 'Snapshot lines at checkout; name duplicated for ad-hoc items without SKU.';

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_inventory_idx on public.sale_items (inventory_item_id);

-- ---------------------------------------------------------------------------
-- Settings (key/value JSON)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now()
);

comment on table public.settings is 'Mutable business configuration (hours, tax rate, branding keys).';

insert into public.settings (key, value, description)
values
  (
    'business',
    '{"name": "Liberian Beauty Salon & Supplies", "timezone": "Africa/Monrovia"}'::jsonb,
    'Business display name and timezone'
  ),
  ('currency', '{"code": "LRD"}'::jsonb, 'Default retail currency')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Extend existing booking tables (from prior migration)
-- ---------------------------------------------------------------------------
alter table public.services
  add column if not exists updated_at timestamptz not null default now();

alter table public.stylists
  add column if not exists user_id uuid references public.users (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists stylists_user_id_idx on public.stylists (user_id);

alter table public.bookings
  add column if not exists customer_id uuid references public.customers (id) on delete set null,
  add column if not exists status public.booking_status not null default 'confirmed',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists bookings_customer_id_idx on public.bookings (customer_id);
create index if not exists bookings_status_idx on public.bookings (status);

-- ---------------------------------------------------------------------------
-- updated_at touch helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_users_updated_at on public.users;
create trigger tr_users_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_customers_updated_at on public.customers;
create trigger tr_customers_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_suppliers_updated_at on public.suppliers;
create trigger tr_suppliers_updated_at
  before update on public.suppliers
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_inventory_items_updated_at on public.inventory_items;
create trigger tr_inventory_items_updated_at
  before update on public.inventory_items
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_sales_updated_at on public.sales;
create trigger tr_sales_updated_at
  before update on public.sales
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_settings_updated_at on public.settings;
create trigger tr_settings_updated_at
  before update on public.settings
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_services_updated_at on public.services;
create trigger tr_services_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_stylists_updated_at on public.stylists;
create trigger tr_stylists_updated_at
  before update on public.stylists
  for each row
  execute function public.set_updated_at();

drop trigger if exists tr_bookings_updated_at on public.bookings;
create trigger tr_bookings_updated_at
  before update on public.bookings
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create public.users when a Supabase Auth user registers
-- ---------------------------------------------------------------------------
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
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.settings enable row level security;

-- Helper: staff-like roles for policies
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
      and r.slug in ('admin', 'manager', 'staff', 'stylist')
  );
$$;

grant execute on function public.is_staff_user() to authenticated;

-- Roles: any signed-in user can read role names (for UI); anon has no access
drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated"
  on public.roles for select
  to authenticated
  using (true);

-- Users: read/update own row
drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Staff can read all users (admin directory) — optional; tighten if needed
drop policy if exists "users_select_staff" on public.users;
create policy "users_select_staff"
  on public.users for select
  to authenticated
  using (public.is_staff_user());

-- Customers: staff full CRUD
drop policy if exists "customers_staff_all" on public.customers;
create policy "customers_staff_all"
  on public.customers for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

-- Suppliers, inventory, stock, sales: staff only
drop policy if exists "suppliers_staff_all" on public.suppliers;
create policy "suppliers_staff_all"
  on public.suppliers for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "inventory_staff_all" on public.inventory_items;
create policy "inventory_staff_all"
  on public.inventory_items for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "stock_movements_staff_all" on public.stock_movements;
create policy "stock_movements_staff_all"
  on public.stock_movements for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "sales_staff_all" on public.sales;
create policy "sales_staff_all"
  on public.sales for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "sale_items_staff_all" on public.sale_items;
create policy "sale_items_staff_all"
  on public.sale_items for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

-- Settings: admin/manager read/write; staff read
drop policy if exists "settings_staff_select" on public.settings;
create policy "settings_staff_select"
  on public.settings for select
  to authenticated
  using (public.is_staff_user());

drop policy if exists "settings_admin_insert" on public.settings;
create policy "settings_admin_insert"
  on public.settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug in ('admin', 'manager')
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
        and r.slug in ('admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug in ('admin', 'manager')
    )
  );

-- Admins can manage all staff profiles (role changes, deactivate)
drop policy if exists "users_admin_manage" on public.users;
create policy "users_admin_manage"
  on public.users for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.users u
      join public.roles r on r.id = u.role_id
      where u.id = auth.uid()
        and r.slug = 'admin'
    )
  );

-- Note: service_role key bypasses RLS — Next.js server actions use it for public booking flow.
