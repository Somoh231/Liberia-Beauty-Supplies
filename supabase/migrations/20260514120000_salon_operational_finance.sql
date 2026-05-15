-- =============================================================================
-- Operational finance fields: NGN→USD inventory costing, sale/service USD
-- reporting snapshots, service categories, supplier product category.
-- Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- inventory_items — costing & retail list prices
-- ---------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists fx_ngn_per_usd numeric(14, 4),
  add column if not exists landed_usd_cents_per_unit bigint not null default 0,
  add column if not exists store_price_usd_cents bigint,
  add column if not exists sell_price_usd_cents bigint,
  add column if not exists sell_price_lrd_cents bigint;

comment on column public.inventory_items.fx_ngn_per_usd is 'NGN per 1 USD (e.g. 1550 = ₦1550 buys $1). Used with NGN unit cost.';
comment on column public.inventory_items.landed_usd_cents_per_unit is 'Per-unit landed/shipping allocation in USD cents, added after NGN→USD conversion.';
comment on column public.inventory_items.store_price_usd_cents is 'Internal store valuation in USD cents.';
comment on column public.inventory_items.sell_price_usd_cents is 'Target retail in USD cents.';
comment on column public.inventory_items.sell_price_lrd_cents is 'Target retail in Liberian dollar minor units (LRD cents).';

alter table public.inventory_items drop constraint if exists inventory_items_landed_usd_nonneg;
alter table public.inventory_items
  add constraint inventory_items_landed_usd_nonneg check (landed_usd_cents_per_unit >= 0);

-- ---------------------------------------------------------------------------
-- sales — customer + USD reporting snapshots
-- ---------------------------------------------------------------------------
alter table public.sales
  add column if not exists customer_name text,
  add column if not exists revenue_usd_equiv_cents bigint,
  add column if not exists gross_profit_usd_cents bigint;

comment on column public.sales.revenue_usd_equiv_cents is 'Line revenue converted to USD cents for consolidated reporting.';
comment on column public.sales.gross_profit_usd_cents is 'Line gross profit in USD cents (revenue USD equiv − qty × unit USD cost).';

-- ---------------------------------------------------------------------------
-- service_logs — category + USD reporting
-- ---------------------------------------------------------------------------
alter table public.service_logs
  add column if not exists service_category text,
  add column if not exists revenue_usd_equiv_cents bigint;

comment on column public.service_logs.service_category is 'Salon service bucket (braids, nails, etc.).';
comment on column public.service_logs.revenue_usd_equiv_cents is 'Service revenue converted to USD cents for reporting.';

-- ---------------------------------------------------------------------------
-- suppliers — lightweight retail category
-- ---------------------------------------------------------------------------
alter table public.suppliers
  add column if not exists product_category text;

comment on column public.suppliers.product_category is 'Primary product type supplied (hair, nails, etc.).';
