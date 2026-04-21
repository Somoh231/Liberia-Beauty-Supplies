-- =============================================================================
-- Inventory platform (self-contained for Supabase SQL Editor)
-- Creates: inventory_categories, suppliers, inventory_items, stock_movements,
--          purchase_invoices, purchase_items; indexes; RLS; ledger trigger;
--          commit_purchase_invoice RPC; admin portal helpers used by purchases.
-- Safe to re-run: uses IF NOT EXISTS / DROP IF EXISTS / OR REPLACE where possible.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enum: stock movement reasons
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Roles & users (required for stock_movements.created_by, RLS, portal RPC)
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into public.roles (slug, name, description)
values
  ('admin', 'Administrator', 'Full access to settings, users, inventory, and sales.'),
  ('manager', 'Manager', 'Operations: bookings, inventory, sales, reports.'),
  ('stylist', 'Stylist', 'Service calendar and assigned customer context.'),
  ('staff', 'Staff', 'Front desk / retail — POS and stock adjustments.'),
  ('readonly', 'Read only', 'Dashboards and exports without write access.')
on conflict (slug) do nothing;

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

create index if not exists users_role_id_idx on public.users (role_id);
create index if not exists users_email_lower_idx on public.users (lower(email));

-- ---------------------------------------------------------------------------
-- Touch helper
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

-- ---------------------------------------------------------------------------
-- Staff check for RLS
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Admin portal (used by commit_purchase_invoice and app middleware RPC)
-- ---------------------------------------------------------------------------
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

drop trigger if exists tr_users_updated_at on public.users;
create trigger tr_users_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Product categories (app uses table name inventory_categories)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.inventory_categories is 'Product classification for catalog, filters, and reporting.';

insert into public.inventory_categories (name, slug, sort_order)
values
  ('Hair & scalp', 'hair-scalp', 10),
  ('Nails & beauty', 'nails-beauty', 20),
  ('Retail & supplies', 'retail-supplies', 30),
  ('Equipment', 'equipment', 40),
  ('General', 'general', 99)
on conflict (slug) do nothing;

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

drop trigger if exists tr_suppliers_updated_at on public.suppliers;
create trigger tr_suppliers_updated_at
  before update on public.suppliers
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory items (core + platform columns)
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

alter table public.inventory_items
  add column if not exists category_id uuid references public.inventory_categories (id) on delete set null;

alter table public.inventory_items
  add column if not exists selling_price_cents int;

alter table public.inventory_items
  add column if not exists expiry_date date;

alter table public.inventory_items
  add column if not exists last_purchase_at timestamptz;

comment on column public.inventory_items.selling_price_cents is 'Default retail / list price in minor units (e.g. cents).';
comment on column public.inventory_items.expiry_date is 'Optional shelf / lot expiry for dated consumables.';
comment on column public.inventory_items.category_id is 'FK to inventory_categories for catalog grouping.';
comment on column public.inventory_items.last_purchase_at is 'Most recent purchase receipt affecting this SKU (from purchase invoice or manual restock).';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_selling_price_nonneg'
  ) then
    alter table public.inventory_items add constraint inventory_items_selling_price_nonneg
      check (selling_price_cents is null or selling_price_cents >= 0);
  end if;
end $$;

create index if not exists inventory_items_supplier_idx on public.inventory_items (supplier_id);
create index if not exists inventory_items_active_idx on public.inventory_items (active) where active = true;
create index if not exists inventory_items_category_id_idx on public.inventory_items (category_id);
create index if not exists inventory_items_expiry_idx on public.inventory_items (expiry_date) where expiry_date is not null;

drop trigger if exists tr_inventory_items_updated_at on public.inventory_items;
create trigger tr_inventory_items_updated_at
  before update on public.inventory_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Stock movements ledger
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
-- Purchase invoices & line items
-- ---------------------------------------------------------------------------
create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  supplier_name text not null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  total_amount_cents bigint not null default 0,
  currency text not null default 'NGN',
  purchase_date date not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchase_invoices_total_nonneg check (total_amount_cents >= 0),
  constraint purchase_invoices_invoice_supplier_unique unique (invoice_number, supplier_id)
);

comment on table public.purchase_invoices is 'Supplier purchase headers; amounts in minor units of currency (e.g. kobo for NGN).';

create index if not exists purchase_invoices_purchase_date_idx on public.purchase_invoices (purchase_date desc);
create index if not exists purchase_invoices_supplier_id_idx on public.purchase_invoices (supplier_id);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete cascade,
  product_id uuid not null references public.inventory_items (id) on delete restrict,
  product_name text not null,
  qty numeric(14, 4) not null,
  unit_cost_cents int not null,
  line_total_cents bigint not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint purchase_items_qty_pos check (qty > 0),
  constraint purchase_items_unit_cost_nonneg check (unit_cost_cents >= 0),
  constraint purchase_items_line_total_nonneg check (line_total_cents >= 0)
);

comment on table public.purchase_items is 'Line items for a purchase invoice; product_id references inventory_items.';

create index if not exists purchase_items_invoice_id_idx on public.purchase_items (invoice_id);
create index if not exists purchase_items_product_id_idx on public.purchase_items (product_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.inventory_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "roles_select_authenticated" on public.roles;
create policy "roles_select_authenticated"
  on public.roles for select
  to authenticated
  using (true);

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

drop policy if exists "users_select_staff" on public.users;
create policy "users_select_staff"
  on public.users for select
  to authenticated
  using (public.is_staff_user());

drop policy if exists "inventory_categories_staff_all" on public.inventory_categories;
create policy "inventory_categories_staff_all"
  on public.inventory_categories for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

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

drop policy if exists "purchase_invoices_staff_all" on public.purchase_invoices;
create policy "purchase_invoices_staff_all"
  on public.purchase_invoices for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "purchase_items_staff_all" on public.purchase_items;
create policy "purchase_items_staff_all"
  on public.purchase_items for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

-- ---------------------------------------------------------------------------
-- commit_purchase_invoice (weighted average cost + stock ledger)
-- ---------------------------------------------------------------------------
create or replace function public.commit_purchase_invoice(p_invoice jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv_id uuid;
  v_supplier_id uuid;
  v_supplier_name text := trim(both from coalesce(p_invoice->>'supplier_name', ''));
  v_inv_no text := trim(both from coalesce(p_invoice->>'invoice_number', ''));
  v_pdate date;
  v_currency text := coalesce(nullif(trim(both from coalesce(p_invoice->>'currency', '')), ''), 'NGN');
  v_lines jsonb := p_invoice->'lines';
  v_line jsonb;
  v_total bigint := 0;
  v_name text;
  v_qty numeric(14, 4);
  v_uc int;
  v_lt bigint;
  v_pid uuid;
  v_q0 numeric(14, 4);
  v_c0 int;
  v_new_qty numeric(14, 4);
  v_new_cost int;
  v_sort int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not public.can_access_admin_portal() then
    raise exception 'forbidden';
  end if;

  if length(v_supplier_name) < 2 then
    raise exception 'invalid_supplier_name';
  end if;

  if length(v_inv_no) < 1 then
    raise exception 'invalid_invoice_number';
  end if;

  begin
    v_pdate := (p_invoice->>'purchase_date')::date;
  exception when others then
    raise exception 'invalid_purchase_date';
  end;

  if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'no_lines';
  end if;

  select coalesce(sum((e->>'line_total_cents')::bigint), 0)
    into v_total
  from jsonb_array_elements(v_lines) as e;

  select s.id
    into v_supplier_id
  from public.suppliers s
  where lower(trim(s.name)) = lower(v_supplier_name)
  limit 1;

  if v_supplier_id is null then
    insert into public.suppliers (name, active)
    values (v_supplier_name, true)
    returning id into v_supplier_id;
  end if;

  if exists (
    select 1
    from public.purchase_invoices pi
    where pi.invoice_number = v_inv_no
      and pi.supplier_id = v_supplier_id
  ) then
    raise exception 'duplicate_invoice';
  end if;

  insert into public.purchase_invoices (
    invoice_number,
    supplier_name,
    supplier_id,
    total_amount_cents,
    currency,
    purchase_date,
    created_by
  )
  values (
    v_inv_no,
    v_supplier_name,
    v_supplier_id,
    v_total,
    v_currency,
    v_pdate,
    v_uid
  )
  returning id into v_inv_id;

  for v_line in select jsonb_array_elements(v_lines)
  loop
    v_sort := v_sort + 1;
    v_name := trim(both from coalesce(v_line->>'product_name', ''));
    begin
      v_qty := (v_line->>'qty')::numeric(14, 4);
    exception when others then
      raise exception 'invalid_qty';
    end;
    begin
      v_uc := (v_line->>'unit_cost_cents')::int;
      v_lt := (v_line->>'line_total_cents')::bigint;
    exception when others then
      raise exception 'invalid_money';
    end;

    if length(v_name) < 1 then
      raise exception 'invalid_product_name';
    end if;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_qty';
    end if;

    if v_uc < 0 or v_lt < 0 then
      raise exception 'invalid_money';
    end if;

    select i.id
      into v_pid
    from public.inventory_items i
    where lower(trim(i.name)) = lower(v_name)
      and i.active = true
    order by i.created_at asc
    limit 1;

    if v_pid is null then
      insert into public.inventory_items (
        name,
        unit,
        reorder_point,
        quantity_on_hand,
        active,
        supplier_id,
        unit_cost_cents
      )
      values (
        v_name,
        'each',
        5,
        0,
        true,
        v_supplier_id,
        null
      )
      returning id into v_pid;
    end if;

    insert into public.purchase_items (
      invoice_id,
      product_id,
      product_name,
      qty,
      unit_cost_cents,
      line_total_cents,
      sort_order
    )
    values (
      v_inv_id,
      v_pid,
      v_name,
      v_qty,
      v_uc,
      v_lt,
      v_sort
    );

    select i.quantity_on_hand, i.unit_cost_cents
      into strict v_q0, v_c0
    from public.inventory_items i
    where i.id = v_pid
    for update;

    v_new_qty := v_q0 + v_qty;

    if v_new_qty > 0 then
      v_new_cost := round(
        (coalesce(v_c0, v_uc)::numeric * v_q0 + v_uc::numeric * v_qty) / v_new_qty
      )::int;
    else
      v_new_cost := v_uc;
    end if;

    insert into public.stock_movements (
      inventory_item_id,
      quantity_change,
      reason,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      v_pid,
      v_qty,
      'purchase',
      'purchase_invoice',
      v_inv_id,
      format('Invoice %s — %s', v_inv_no, v_supplier_name),
      v_uid
    );

    update public.inventory_items i
    set
      unit_cost_cents = v_new_cost,
      last_purchase_at = now(),
      supplier_id = coalesce(i.supplier_id, v_supplier_id),
      updated_at = now()
    where i.id = v_pid;
  end loop;

  return v_inv_id;
end;
$$;

comment on function public.commit_purchase_invoice(jsonb) is 'Creates purchase invoice + items, posts purchase stock_movements, updates weighted unit_cost_cents and last_purchase_at.';

revoke all on function public.commit_purchase_invoice(jsonb) from public;
grant execute on function public.commit_purchase_invoice(jsonb) to authenticated;

-- Optional: default supplier row for UC Maduson invoice imports (no-op if exists)
insert into public.suppliers (name, active)
select 'UC Maduson', true
where not exists (
  select 1 from public.suppliers s where lower(trim(s.name)) = lower('UC Maduson')
);
