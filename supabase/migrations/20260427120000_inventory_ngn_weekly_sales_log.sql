-- =============================================================================
-- Inventory: product codes, NGN, stock status + Weekly sales log module
-- Extends inventory_items; adds weekly_sales_reports + line tables + triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Global product code sequence (never reused after delete)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_product_code_seq (
  id int primary key check (id = 1),
  next_n bigint not null default 1
);

insert into public.inventory_product_code_seq (id, next_n)
values (1, 1)
on conflict (id) do nothing;

create or replace function public.allocate_inventory_product_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v bigint;
  s text;
begin
  update public.inventory_product_code_seq
  set next_n = next_n + 1
  where id = 1
  returning next_n - 1 into v;

  s := v::text;
  return lpad(s, greatest(3, length(s)), '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- inventory_items: new columns + generated stock status + stock value
-- ---------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists product_code text,
  add column if not exists product_name text,
  add column if not exists category text,
  add column if not exists notes text,
  add column if not exists reorder_level numeric(14, 4),
  add column if not exists low_stock_threshold numeric(14, 4) not null default 5,
  add column if not exists deleted_at timestamptz;

-- Backfill from legacy columns
update public.inventory_items
set
  product_name = coalesce(nullif(trim(product_name), ''), name),
  reorder_level = coalesce(reorder_level, reorder_point, 5),
  low_stock_threshold = case when low_stock_threshold is null then 5 else low_stock_threshold end
where product_name is null or product_name = '' or reorder_level is null;

update public.inventory_items
set name = product_name
where name is distinct from product_name;

-- Assign codes to existing rows missing code (local sequence; sync global counter after)
do $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.inventory_items where product_code is null or trim(product_code) = '' order by created_at
  loop
    n := n + 1;
    update public.inventory_items
    set product_code = lpad(n::text, 3, '0')
    where id = r.id;
  end loop;
end $$;

update public.inventory_product_code_seq s
set next_n = greatest(
  s.next_n,
  coalesce(
    (
      select max((regexp_replace(product_code, '^0+', '', 'g'))::bigint) + 1
      from public.inventory_items
      where product_code ~ '^[0-9]+$'
    ),
    1
  )
)
where s.id = 1;

-- Sync sequence to max numeric code
alter table public.inventory_items
  alter column product_code set not null,
  alter column product_name set not null;

drop index if exists public.inventory_items_product_code_uidx;
create unique index inventory_items_product_code_uidx on public.inventory_items (product_code);

-- Drop generated columns if re-run
alter table public.inventory_items drop column if exists stock_status cascade;
alter table public.inventory_items drop column if exists total_stock_value_minor cascade;

alter table public.inventory_items
  add column stock_status text generated always as (
    case
      when coalesce(quantity_on_hand, 0) <= 0 then 'out_of_stock'
      when quantity_on_hand <= low_stock_threshold then 'low_stock'
      else 'in_stock'
    end
  ) stored;

alter table public.inventory_items
  add column total_stock_value_minor bigint generated always as (
    round(coalesce(quantity_on_hand, 0) * coalesce(avg_unit_cost_cents, 0)::numeric)::bigint
  ) stored;

-- Currency: allow NGN (minor = kobo)
alter table public.inventory_items drop constraint if exists inventory_items_cost_currency_check;
alter table public.inventory_items
  add constraint inventory_items_cost_currency_check check (cost_currency in ('USD', 'LRD', 'NGN'));

alter table public.inventory_items drop constraint if exists inventory_items_default_price_currency_check;
alter table public.inventory_items
  add constraint inventory_items_default_price_currency_check check (default_price_currency in ('USD', 'LRD', 'NGN'));

update public.inventory_items set cost_currency = 'NGN' where cost_currency not in ('NGN', 'USD', 'LRD');
update public.inventory_items set default_price_currency = cost_currency where default_price_currency not in ('NGN', 'USD', 'LRD');

alter table public.purchases drop constraint if exists purchases_currency_check;
alter table public.purchases
  add constraint purchases_currency_check check (currency in ('USD', 'LRD', 'NGN'));

alter table public.sales drop constraint if exists sales_currency_check;
alter table public.sales
  add constraint sales_currency_check check (currency in ('USD', 'LRD', 'NGN'));

alter table public.service_logs drop constraint if exists service_logs_currency_check;
alter table public.service_logs
  add constraint service_logs_currency_check check (currency in ('USD', 'LRD', 'NGN'));

-- Auto product_code + sync name
create or replace function public.trg_inventory_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.product_code is null or trim(new.product_code) = '' then
      new.product_code := public.allocate_inventory_product_code();
    end if;
  end if;

  if new.product_name is null or trim(new.product_name) = '' then
    new.product_name := coalesce(nullif(trim(new.name), ''), 'Product');
  end if;

  new.name := new.product_name;

  if new.reorder_level is null then
    new.reorder_level := coalesce(new.reorder_point, 5);
  end if;

  if new.reorder_point is null then
    new.reorder_point := new.reorder_level;
  end if;

  return new;
end;
$$;

drop trigger if exists tr_inventory_items_before_ins on public.inventory_items;
create trigger tr_inventory_items_before_ins
  before insert on public.inventory_items
  for each row execute function public.trg_inventory_items_before_write();

drop trigger if exists tr_inventory_items_before_upd on public.inventory_items;
create trigger tr_inventory_items_before_upd
  before update on public.inventory_items
  for each row execute function public.trg_inventory_items_before_write();

-- ---------------------------------------------------------------------------
-- Weekly sales log
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_sales_reports (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  staff_on_duty text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_sales_reports_dates check (end_date >= start_date)
);

create index if not exists weekly_sales_reports_created_idx on public.weekly_sales_reports (created_at desc);

create table if not exists public.weekly_product_sales (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_sales_reports (id) on delete cascade,
  day_date date not null,
  inventory_item_id uuid not null references public.inventory_items (id) on delete restrict,
  qty_sold numeric(14, 4) not null,
  unit_price_minor bigint not null,
  line_total_minor bigint not null,
  currency text not null default 'NGN' check (currency in ('USD', 'LRD', 'NGN')),
  payment_method text,
  staff_name text,
  created_at timestamptz not null default now(),
  constraint weekly_product_sales_qty check (qty_sold > 0),
  constraint weekly_product_sales_prices check (unit_price_minor >= 0 and line_total_minor >= 0)
);

create index if not exists weekly_product_sales_report_idx on public.weekly_product_sales (report_id);
create index if not exists weekly_product_sales_day_idx on public.weekly_product_sales (day_date);

create table if not exists public.weekly_service_sales (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_sales_reports (id) on delete cascade,
  day_date date not null,
  service_name text not null,
  stylist_name text,
  client_name text,
  amount_minor bigint not null,
  currency text not null default 'NGN' check (currency in ('USD', 'LRD', 'NGN')),
  payment_method text,
  notes text,
  created_at timestamptz not null default now(),
  constraint weekly_service_sales_amount check (amount_minor >= 0)
);

create index if not exists weekly_service_sales_report_idx on public.weekly_service_sales (report_id);

create table if not exists public.weekly_stylist_space_payments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.weekly_sales_reports (id) on delete cascade,
  stylist_name text not null,
  space_number text,
  week_period text,
  amount_paid_minor bigint not null default 0,
  balance_due_minor bigint not null default 0,
  currency text not null default 'NGN' check (currency in ('USD', 'LRD', 'NGN')),
  payment_method text,
  created_at timestamptz not null default now(),
  constraint weekly_space_money check (amount_paid_minor >= 0 and balance_due_minor >= 0)
);

create index if not exists weekly_space_report_idx on public.weekly_stylist_space_payments (report_id);

drop trigger if exists tr_weekly_sales_reports_updated_at on public.weekly_sales_reports;
create trigger tr_weekly_sales_reports_updated_at
  before update on public.weekly_sales_reports
  for each row execute function public.set_updated_at();

-- Decrement inventory when a weekly product line is saved
create or replace function public.trg_weekly_product_sales_after_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_on_hand numeric(14, 4);
begin
  select i.quantity_on_hand
    into strict v_on_hand
  from public.inventory_items i
  where i.id = new.inventory_item_id
    and i.deleted_at is null
  for update;

  if v_on_hand + 1e-9 < new.qty_sold then
    raise exception 'insufficient_stock_for_weekly_sale' using errcode = 'P0001';
  end if;

  update public.inventory_items
  set quantity_on_hand = quantity_on_hand - new.qty_sold, updated_at = now()
  where id = new.inventory_item_id;

  return new;
end;
$$;

drop trigger if exists tr_weekly_product_sales_after_ins on public.weekly_product_sales;
create trigger tr_weekly_product_sales_after_ins
  after insert on public.weekly_product_sales
  for each row execute function public.trg_weekly_product_sales_after_ins();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.weekly_sales_reports enable row level security;
alter table public.weekly_product_sales enable row level security;
alter table public.weekly_service_sales enable row level security;
alter table public.weekly_stylist_space_payments enable row level security;

drop policy if exists "weekly_reports_staff" on public.weekly_sales_reports;
create policy "weekly_reports_staff"
  on public.weekly_sales_reports for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "weekly_product_sales_staff" on public.weekly_product_sales;
create policy "weekly_product_sales_staff"
  on public.weekly_product_sales for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "weekly_service_sales_staff" on public.weekly_service_sales;
create policy "weekly_service_sales_staff"
  on public.weekly_service_sales for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

drop policy if exists "weekly_space_staff" on public.weekly_stylist_space_payments;
create policy "weekly_space_staff"
  on public.weekly_stylist_space_payments for all
  to authenticated
  using (public.can_access_admin_portal())
  with check (public.can_access_admin_portal());

-- ---------------------------------------------------------------------------
-- Seed supplier + bulk products (NGN, kobo = Naira × 100)
-- ---------------------------------------------------------------------------
insert into public.suppliers (name, country_origin, active, notes)
select 'Nnaemeka Global Resources', 'Nigeria', true, 'Default import supplier'
where not exists (select 1 from public.suppliers s where lower(trim(s.name)) = lower('Nnaemeka Global Resources'));

do $$
declare
  v_supplier_id uuid;
begin
  select s.id into v_supplier_id from public.suppliers s where lower(trim(s.name)) = lower('Nnaemeka Global Resources') limit 1;

  insert into public.inventory_items (
    supplier_id,
    sku,
    name,
    product_name,
    product_code,
    unit,
    quantity_on_hand,
    reorder_point,
    reorder_level,
    low_stock_threshold,
    avg_unit_cost_cents,
    cost_currency,
    default_unit_price_cents,
    default_price_currency,
    category,
    active
  )
  select
    v_supplier_id,
    'imp-' || x.code,
    x.pname,
    x.pname,
    x.code,
    'each',
    x.qty::numeric,
    5,
    5,
    5,
    round(x.unit_naira::numeric * 100)::bigint,
    'NGN',
    round(x.unit_naira::numeric * 100)::bigint,
    'NGN',
    x.cat,
    true
  from (
    values
      ('001', 'Human Hair curly 16', 10::numeric, 9500::numeric, 'hair'),
      ('002', 'Human Hair curly 14', 10, 15500, 'hair'),
      ('003', 'Lily twist ly', 5, 4700, 'hair'),
      ('004', 'Lady twist', 5, 3900, 'hair'),
      ('005', 'Soft twist', 10, 4500, 'hair'),
      ('006', 'Ceres Gabra', 5, 4700, 'hair'),
      ('007', 'Bony curly', 10, 5000, 'hair'),
      ('008', 'Natural ly', 10, 4600, 'hair'),
      ('009', 'Hawaiian', 15, 7500, 'hair'),
      ('010', 'Joke', 10, 4500, 'hair'),
      ('011', 'Jumbo', 20, 5700, 'hair'),
      ('012', 'Super braid', 15, 5600, 'hair'),
      ('013', 'Way braid', 25, 4300, 'hair'),
      ('014', 'Fantastic twist', 20, 4300, 'hair'),
      ('015', 'Bure straight', 20, 4500, 'hair'),
      ('016', 'Body wave', 25, 5000, 'hair'),
      ('017', 'Lash bed', 1, 90000, 'lash'),
      ('018', 'Spa stool', 1, 45000, 'lash'),
      ('019', 'Lash pillow', 1, 10000, 'lash'),
      ('020', 'Glove black', 1, 15000, 'lash'),
      ('021', 'Mapping pen 3in1', 1, 20000, 'lash'),
      ('022', 'Brow stencil', 3, 20000, 'lash'),
      ('023', 'Sachet ointment', 1, 12000, 'lash'),
      ('024', 'Tag 45', 2, 14000, 'lash'),
      ('025', 'Cling film', 4, 2000, 'lash'),
      ('026', 'Tweezed case', 2, 2500, 'lash'),
      ('027', 'BA3 machine', 2, 50000, 'equipment'),
      ('028', 'Carts ques 3P', 1, 80000, 'equipment'),
      ('029', 'Bed cover', 1, 10000, 'equipment'),
      ('030', 'Pigment orange', 1, 2000, 'pigment'),
      ('031', 'Mousse shampoo', 2, 3000, 'hair-care'),
      ('032', 'Skin', 5, 3000, 'hair-care'),
      ('033', 'Surgical blade pack', 1, 45000, 'equipment'),
      ('034', 'Fano E', 3, 15000, 'hair'),
      ('035', 'Lash sticker', 1, 5000, 'lash'),
      ('036', 'HP brush swap', 2, 1500, 'lash'),
      ('037', 'Brow booster', 3, 10000, 'lash'),
      ('038', 'Pigment black/choc/dark', 4, 15000, 'pigment')
  ) as x(code, pname, qty, unit_naira, cat)
  where not exists (
    select 1 from public.inventory_items i where i.product_code = x.code
  );

  -- Advance global code allocator past seeded codes
  update public.inventory_product_code_seq
  set next_n = greatest(
    next_n,
    coalesce(
      (
        select max((regexp_replace(product_code, '^0+', '', 'g'))::bigint) + 1
        from public.inventory_items
        where product_code ~ '^[0-9]+$'
      ),
      1
    )
  )
  where id = 1;
end $$;

comment on column public.inventory_items.product_code is 'Sequential display code; never reused (global counter).';
comment on column public.inventory_items.stock_status is 'Generated: out_of_stock | low_stock | in_stock';
comment on table public.weekly_sales_reports is 'Weekly sales log header (Monrovia-friendly date range).';
