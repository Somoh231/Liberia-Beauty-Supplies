-- =============================================================================
-- Salon management v2 — simplified business schema
-- Replaces legacy bookings/POS/weekly-log/stock_movement tables with:
--   suppliers, purchases, purchase_lines, inventory_items, sales, service_logs
-- Preserves: public.roles, public.users, auth triggers, can_access_admin_portal
-- Apply after prior migrations; this migration DROPS obsolete objects.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Drop legacy views & functions
-- ---------------------------------------------------------------------------
drop view if exists public.admin_customer_booking_stats cascade;

drop function if exists public.create_pos_sale(text, uuid, text, jsonb) cascade;
drop function if exists public.commit_purchase_invoice(jsonb) cascade;
drop function if exists public.create_booking_atomic(uuid, uuid, timestamptz, text, text, text, text) cascade;
drop function if exists public.create_booking_atomic(uuid, timestamptz, text, text, text, text) cascade;

-- resolve overloads by name from older booking migration
do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as p
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'create_booking_atomic',
        'apply_stock_movement',
        'reconcile_weekly_log_product_stock'
      )
  loop
    execute format('drop function if exists %s cascade', r.p);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Drop legacy tables (order: dependents first)
-- ---------------------------------------------------------------------------
drop table if exists public.weekly_log_product_lines cascade;
drop table if exists public.weekly_log_service_lines cascade;
drop table if exists public.weekly_logs cascade;

drop table if exists public.stock_movements cascade;

drop table if exists public.purchase_items cascade;
drop table if exists public.purchase_invoices cascade;

drop table if exists public.sale_items cascade;
drop table if exists public.sales cascade;

drop table if exists public.bookings cascade;
drop table if exists public.stylist_services cascade;
drop table if exists public.stylists cascade;
drop table if exists public.services cascade;

drop table if exists public.inventory_categories cascade;

drop table if exists public.inventory_items cascade;
drop table if exists public.suppliers cascade;

drop table if exists public.customers cascade;
drop table if exists public.settings cascade;

-- legacy enums (re-create only if needed elsewhere)
drop type if exists public.booking_status cascade;
drop type if exists public.sale_status cascade;
-- keep stock_movement_reason if referenced; dropped with stock_movements
drop type if exists public.stock_movement_reason cascade;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  country_origin text not null default 'Nigeria',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index suppliers_active_idx on public.suppliers (active) where active = true;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id) on delete set null,
  sku text unique,
  name text not null,
  unit text not null default 'each',
  quantity_on_hand numeric(14, 4) not null default 0,
  reorder_point numeric(14, 4) not null default 0,
  avg_unit_cost_cents bigint not null default 0,
  cost_currency text not null default 'USD' check (cost_currency in ('USD', 'LRD')),
  default_unit_price_cents bigint,
  default_price_currency text not null default 'USD' check (default_price_currency in ('USD', 'LRD')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_qty_non_negative check (quantity_on_hand >= 0),
  constraint inventory_items_reorder_nonneg check (reorder_point >= 0),
  constraint inventory_items_avg_cost_nonneg check (avg_unit_cost_cents >= 0)
);

create index inventory_items_active_idx on public.inventory_items (active) where active = true;
create index inventory_items_supplier_idx on public.inventory_items (supplier_id);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  purchase_date date not null default (timezone('UTC', now()))::date,
  currency text not null default 'USD' check (currency in ('USD', 'LRD')),
  status text not null default 'draft' check (status in ('draft', 'received')),
  notes text,
  shipping_reference text,
  received_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchases_no_unreceive check (status <> 'received' or received_at is not null)
);

create index purchases_supplier_idx on public.purchases (supplier_id);
create index purchases_date_idx on public.purchases (purchase_date desc);
create index purchases_status_idx on public.purchases (status);

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  qty numeric(14, 4) not null,
  unit_cost_cents bigint not null,
  constraint purchase_lines_qty_positive check (qty > 0),
  constraint purchase_lines_cost_nonneg check (unit_cost_cents >= 0)
);

create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id);
create index purchase_lines_item_idx on public.purchase_lines (inventory_item_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  qty numeric(14, 4) not null,
  unit_price_cents bigint not null,
  unit_cost_cents bigint not null,
  currency text not null check (currency in ('USD', 'LRD')),
  sold_at timestamptz not null default now(),
  payment_method text,
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_qty_positive check (qty > 0),
  constraint sales_prices_nonneg check (unit_price_cents >= 0 and unit_cost_cents >= 0)
);

create index sales_item_idx on public.sales (inventory_item_id);
create index sales_sold_at_idx on public.sales (sold_at desc);

create table public.service_logs (
  id uuid primary key default gen_random_uuid(),
  service_name text not null,
  revenue_cents bigint not null,
  currency text not null check (currency in ('USD', 'LRD')),
  sold_at timestamptz not null default now(),
  staff_name text,
  client_note text,
  product_usage jsonb not null default '[]'::jsonb,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint service_logs_revenue_nonneg check (revenue_cents >= 0),
  constraint service_logs_usage_is_array check (jsonb_typeof(product_usage) = 'array')
);

create index service_logs_sold_at_idx on public.service_logs (sold_at desc);

-- ---------------------------------------------------------------------------
-- Triggers: updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists tr_suppliers_updated_at on public.suppliers;
create trigger tr_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

drop trigger if exists tr_inventory_items_updated_at on public.inventory_items;
create trigger tr_inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

drop trigger if exists tr_purchases_updated_at on public.purchases;
create trigger tr_purchases_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Purchase received → stock + weighted average cost (same currency only)
-- ---------------------------------------------------------------------------
create or replace function public.apply_purchase_to_inventory(p_purchase_id uuid, p_currency text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_old_qty numeric(14, 4);
  v_old_cost bigint;
  v_old_cc text;
  v_new_qty numeric(14, 4);
  v_new_cost bigint;
begin
  for r in
    select pl.inventory_item_id, pl.qty, pl.unit_cost_cents
    from public.purchase_lines pl
    where pl.purchase_id = p_purchase_id
  loop
    select i.quantity_on_hand, i.avg_unit_cost_cents, i.cost_currency
      into strict v_old_qty, v_old_cost, v_old_cc
    from public.inventory_items i
    where i.id = r.inventory_item_id
    for update;

    v_new_qty := v_old_qty + r.qty;

    if v_old_qty <= 0 or v_old_cc is distinct from p_currency then
      v_new_cost := r.unit_cost_cents;
    else
      v_new_cost := round(
        (v_old_cost::numeric * v_old_qty + r.unit_cost_cents::numeric * r.qty) / nullif(v_new_qty, 0)
      )::bigint;
    end if;

    update public.inventory_items
    set
      quantity_on_hand = v_new_qty,
      avg_unit_cost_cents = v_new_cost,
      cost_currency = p_currency,
      updated_at = now()
    where id = r.inventory_item_id;
  end loop;
end;
$$;

create or replace function public.trg_purchases_after_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'received' and coalesce(old.status, '') is distinct from 'received' then
    perform public.apply_purchase_to_inventory(new.id, new.currency);
    if new.received_at is null then
      new.received_at := now();
    end if;
  end if;

  if coalesce(old.status, '') = 'received' and new.status is distinct from 'received' then
    raise exception 'cannot_change_received_purchase' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_purchases_status on public.purchases;
create trigger tr_purchases_status
  before update of status on public.purchases
  for each row
  execute function public.trg_purchases_after_status();

-- ---------------------------------------------------------------------------
-- Product sale → validate stock then decrement
-- ---------------------------------------------------------------------------
create or replace function public.trg_sales_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric(14, 4);
begin
  select i.quantity_on_hand
    into strict v_qty
  from public.inventory_items i
  where i.id = new.inventory_item_id
  for update;

  if v_qty + 1e-9 < new.qty then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.trg_sales_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.inventory_items
  set
    quantity_on_hand = quantity_on_hand - new.qty,
    updated_at = now()
  where id = new.inventory_item_id;

  return new;
end;
$$;

drop trigger if exists tr_sales_before_insert on public.sales;
create trigger tr_sales_before_insert
  before insert on public.sales
  for each row execute function public.trg_sales_before_insert();

drop trigger if exists tr_sales_after_insert on public.sales;
create trigger tr_sales_after_insert
  after insert on public.sales
  for each row execute function public.trg_sales_after_insert();

-- ---------------------------------------------------------------------------
-- Service log → optional product usage (decrement stock)
-- ---------------------------------------------------------------------------
create or replace function public.trg_service_logs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  el jsonb;
  v_iid uuid;
  v_qty numeric(14, 4);
  v_on_hand numeric(14, 4);
begin
  if new.product_usage is null or jsonb_array_length(new.product_usage) = 0 then
    return new;
  end if;

  for el in select * from jsonb_array_elements(new.product_usage)
  loop
    begin
      v_iid := (el->>'inventory_item_id')::uuid;
      v_qty := (el->>'qty')::numeric(14, 4);
    exception when others then
      raise exception 'invalid_product_usage' using errcode = 'P0001';
    end;

    if v_iid is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid_product_usage' using errcode = 'P0001';
    end if;

    select i.quantity_on_hand
      into strict v_on_hand
    from public.inventory_items i
    where i.id = v_iid
    for update;

    if v_on_hand + 1e-9 < v_qty then
      raise exception 'insufficient_stock_for_service_usage' using errcode = 'P0001';
    end if;

    update public.inventory_items
    set quantity_on_hand = quantity_on_hand - v_qty, updated_at = now()
    where id = v_iid;
  end loop;

  return new;
end;
$$;

drop trigger if exists tr_service_logs_after_insert on public.service_logs;
create trigger tr_service_logs_after_insert
  after insert on public.service_logs
  for each row execute function public.trg_service_logs_after_insert();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.sales enable row level security;
alter table public.service_logs enable row level security;

drop policy if exists "salon_suppliers_staff" on public.suppliers;
create policy "salon_suppliers_staff"
  on public.suppliers for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "salon_inventory_staff" on public.inventory_items;
create policy "salon_inventory_staff"
  on public.inventory_items for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "salon_purchases_staff" on public.purchases;
create policy "salon_purchases_staff"
  on public.purchases for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "salon_purchase_lines_staff" on public.purchase_lines;
create policy "salon_purchase_lines_staff"
  on public.purchase_lines for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "salon_sales_staff" on public.sales;
create policy "salon_sales_staff"
  on public.sales for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "salon_service_logs_staff" on public.service_logs;
create policy "salon_service_logs_staff"
  on public.service_logs for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

comment on table public.suppliers is 'Beauty supply vendors (e.g. Nigeria wholesale).';
comment on table public.purchases is 'Bulk purchase orders; status received applies stock via purchase_lines.';
comment on table public.purchase_lines is 'Line items on a purchase; unit_cost in purchase currency.';
comment on table public.inventory_items is 'Salon retail stock; quantity updated by purchases, sales, service usage.';
comment on table public.sales is 'Retail product sales; unit_cost_cents snapshot for gross profit.';
comment on table public.service_logs is 'Salon service revenue; optional product_usage [{inventory_item_id, qty}].';

-- Purchases must be created as draft; lines are added; then status → received applies stock.
create or replace function public.trg_purchases_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'received' then
    raise exception 'purchase_must_start_as_draft' using errcode = 'P0001';
  end if;
  new.received_at := null;
  return new;
end;
$$;

drop trigger if exists tr_purchases_before_insert on public.purchases;
create trigger tr_purchases_before_insert
  before insert on public.purchases
  for each row execute function public.trg_purchases_before_insert();

-- Optional starter supplier for Nigeria → Liberia workflow
insert into public.suppliers (name, country_origin, active, notes)
select 'Nigeria wholesale partner', 'Nigeria', true, 'Replace with your real supplier names.'
where not exists (select 1 from public.suppliers limit 1);
