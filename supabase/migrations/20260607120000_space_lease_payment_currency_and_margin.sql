-- =============================================================================
-- Chunk 2 + 3: space_lease USD/LRD equiv + FX snapshot; sale margin cost-null safety.
-- Forward-only. Does NOT auto-execute. Does not invent historical product costs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part A: stylist fee / rental currency fields
-- ---------------------------------------------------------------------------
alter table public.space_lease_payments
  add column if not exists amount_usd_equiv_cents bigint,
  add column if not exists fx_lrd_per_usd numeric;

comment on column public.space_lease_payments.amount_cents is
  'Original payment amount in minor units of currency (not replaced by conversion).';
comment on column public.space_lease_payments.currency is
  'Original payment currency. New writes are USD or LRD.';
comment on column public.space_lease_payments.amount_usd_equiv_cents is
  'USD-equivalent minor units for combined reporting. NULL = conversion unavailable (never invent historical FX). Never add to amount_cents. No default 0.';
comment on column public.space_lease_payments.fx_lrd_per_usd is
  'Transaction-time operational LRD per USD snapshot when currency = LRD on write; null for USD and for historical LRD without a snapshot.';

-- Existing rows defaulted to USD historically — backfill USD identity only (not FX).
update public.space_lease_payments
set
  amount_usd_equiv_cents = amount_cents,
  fx_lrd_per_usd = null
where currency = 'USD'
  and amount_usd_equiv_cents is null;

-- Historical LRD/NGN: leave amount_usd_equiv_cents and fx_lrd_per_usd NULL.
-- Do NOT invent transaction-time FX from current operational rates.
-- Reporting treats null as "conversion unavailable" and excludes them from USD totals.

-- No fake zero default: null means missing conversion; 0 means a real zero USD equivalent.
alter table public.space_lease_payments
  alter column amount_usd_equiv_cents drop default;

-- Keep amount_cents >= 0 at table level; trigger + actions require amount_cents > 0 on write.
alter table public.space_lease_payments
  drop constraint if exists space_lease_payments_amount_nonneg;
alter table public.space_lease_payments
  add constraint space_lease_payments_amount_nonneg check (amount_cents >= 0);

alter table public.space_lease_payments
  drop constraint if exists space_lease_payments_usd_equiv_nonneg;
alter table public.space_lease_payments
  add constraint space_lease_payments_usd_equiv_nonneg
  check (amount_usd_equiv_cents is null or amount_usd_equiv_cents >= 0);

create or replace function public.trg_space_lease_payments_set_usd_equiv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fx numeric;
begin
  if new.amount_cents is null or new.amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  new.currency := upper(trim(coalesce(new.currency, '')));
  if new.currency is null or new.currency = '' then
    raise exception 'invalid_currency' using errcode = 'P0001';
  end if;

  -- New authoritative writes: USD / LRD only (NGN retained only if an old row is not rewritten via app).
  if new.currency not in ('USD', 'LRD') then
    raise exception 'unsupported_currency' using errcode = 'P0001';
  end if;

  if new.currency = 'USD' then
    new.amount_usd_equiv_cents := new.amount_cents;
    new.fx_lrd_per_usd := null;
  else
    v_fx := public.operational_lrd_per_usd();
    if v_fx is null or v_fx <= 0 then
      raise exception 'invalid_fx_rate' using errcode = 'P0001';
    end if;
    new.fx_lrd_per_usd := v_fx;
    new.amount_usd_equiv_cents := round(new.amount_cents::numeric / v_fx);
  end if;

  return new;
end;
$$;

drop trigger if exists tr_space_lease_payments_set_usd_equiv on public.space_lease_payments;
create trigger tr_space_lease_payments_set_usd_equiv
  before insert or update of amount_cents, currency
  on public.space_lease_payments
  for each row execute function public.trg_space_lease_payments_set_usd_equiv();

comment on function public.trg_space_lease_payments_set_usd_equiv() is
  'Sets amount_usd_equiv_cents + fx_lrd_per_usd from original amount/currency using operational LRD/USD. Rejects unsupported currency and invalid FX.';

-- ---------------------------------------------------------------------------
-- Part B: sale cost snapshot may be null when cost basis is missing
-- ---------------------------------------------------------------------------
alter table public.sales
  alter column unit_cost_cents drop not null;

alter table public.sales
  drop constraint if exists sales_prices_nonneg;
alter table public.sales
  add constraint sales_prices_nonneg
  check (unit_price_cents >= 0 and (unit_cost_cents is null or unit_cost_cents >= 0));

comment on column public.sales.unit_cost_cents is
  'Immutable sale-time unit cost in USD cents. NULL means cost missing — never treat as zero for margin.';
comment on column public.sales.gross_profit_usd_cents is
  'Line gross profit USD cents (revenue USD equiv − qty × unit cost). NULL when cost is missing.';

-- Clear false 100% margins only when EVERY cost basis is missing.
-- Do not null GP merely because weighted_avg_landed_usd_cents is absent if avg/landed cost exists.
update public.sales s
set
  unit_cost_cents = null,
  gross_profit_usd_cents = null
from public.inventory_items i
where s.inventory_item_id = i.id
  and coalesce(s.unit_cost_cents, 0) = 0
  and coalesce(i.weighted_avg_landed_usd_cents, 0) <= 0
  and coalesce(i.avg_unit_cost_cents, 0) <= 0
  and coalesce(i.landed_usd_cents_per_unit, 0) <= 0;

create or replace function public.resolve_inventory_unit_cost_usd_cents(p_item_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_wac bigint;
  v_avg bigint;
  v_landed bigint;
  v_cost_currency text;
  v_fx_ngn numeric;
  v_base bigint;
begin
  select
    nullif(i.weighted_avg_landed_usd_cents, 0),
    i.avg_unit_cost_cents,
    coalesce(nullif(i.landed_usd_cents_per_unit, 0), 0),
    i.cost_currency,
    coalesce(nullif(i.fx_ngn_per_usd, 0), public.operational_ngn_per_usd())
  into v_wac, v_avg, v_landed, v_cost_currency, v_fx_ngn
  from public.inventory_items i
  where i.id = p_item_id;

  if not found then
    return null;
  end if;

  if v_wac is not null and v_wac > 0 then
    return v_wac;
  end if;

  if v_avg is null or v_avg <= 0 then
    if v_landed > 0 then
      return v_landed;
    end if;
    return null;
  end if;

  if v_cost_currency = 'USD' then
    v_base := v_avg;
  elsif v_cost_currency = 'NGN' then
    if v_fx_ngn is null or v_fx_ngn <= 0 then
      return null;
    end if;
    v_base := round(v_avg::numeric / v_fx_ngn);
  elsif v_cost_currency = 'LRD' then
    if public.operational_lrd_per_usd() is null or public.operational_lrd_per_usd() <= 0 then
      return null;
    end if;
    v_base := round(v_avg::numeric / public.operational_lrd_per_usd());
  else
    return null;
  end if;

  return v_base + v_landed;
end;
$$;

comment on function public.resolve_inventory_unit_cost_usd_cents(uuid) is
  'Sale-time USD unit cost from WAC / supplier cost. Returns NULL when cost basis is missing (never 0 for missing).';

create or replace function public.trg_sales_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric(14, 4);
  v_wac_usd bigint;
  v_rev_usd bigint;
  v_fx_ngn numeric;
begin
  perform public.assert_inventory_item_sellable(new.inventory_item_id, new.unit_price_cents);

  select i.quantity_on_hand,
         coalesce(nullif(i.fx_ngn_per_usd, 0), public.operational_ngn_per_usd())
    into strict v_qty, v_fx_ngn
  from public.inventory_items i
  where i.id = new.inventory_item_id
  for update;

  if v_qty + 1e-9 < new.qty then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  v_wac_usd := public.resolve_inventory_unit_cost_usd_cents(new.inventory_item_id);
  v_rev_usd := public.compute_sale_revenue_usd_cents(new.qty, new.unit_price_cents, new.currency, v_fx_ngn);
  new.revenue_usd_equiv_cents := v_rev_usd;

  if v_wac_usd is null then
    new.unit_cost_cents := null;
    new.gross_profit_usd_cents := null;
  else
    new.unit_cost_cents := v_wac_usd;
    new.gross_profit_usd_cents := v_rev_usd - round(new.qty * v_wac_usd);
  end if;

  return new;
end;
$$;

-- Patch admin_edit_retail_sale cost/GP assignment via wrapper helper used at update time.
-- Full function body replaced to set null GP when cost missing.
create or replace function public.admin_edit_retail_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_sale_id uuid := nullif(trim(p_payload->>'sale_id'), '')::uuid;
  v_reason text := trim(coalesce(p_payload->>'edit_reason', ''));
  v_old public.sales%rowtype;
  v_new_item uuid;
  v_new_qty numeric(14, 4);
  v_new_price bigint;
  v_new_currency text;
  v_new_sold_at timestamptz;
  v_new_customer text;
  v_new_notes text;
  v_day text;
  v_wac_usd bigint;
  v_rev_usd bigint;
  v_gp_usd bigint;
  v_fx_ngn numeric;
  v_new_deleted timestamptz;
  v_id_a uuid;
  v_id_b uuid;
  v_lock_id uuid;
  v_log_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not public.is_salon_portal_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_sale_id is null then
    raise exception 'sale_not_found' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 then
    raise exception 'edit_reason_required' using errcode = 'P0001';
  end if;

  select * into v_old from public.sales where id = v_sale_id for update;
  if not found then
    raise exception 'sale_not_found' using errcode = 'P0001';
  end if;

  v_new_item := coalesce(nullif(trim(p_payload->>'inventory_item_id'), '')::uuid, v_old.inventory_item_id);
  v_new_qty := coalesce((p_payload->>'qty')::numeric, v_old.qty);
  v_new_price := coalesce((p_payload->>'unit_price_cents')::bigint, v_old.unit_price_cents);
  v_new_currency := coalesce(nullif(trim(p_payload->>'currency'), ''), v_old.currency);

  if v_new_qty is null or v_new_qty <= 0 then
    raise exception 'invalid_quantity' using errcode = 'P0001';
  end if;
  if v_new_price is null or v_new_price < 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;
  if v_new_currency not in ('USD', 'LRD', 'NGN') then
    raise exception 'invalid_currency' using errcode = 'P0001';
  end if;

  v_day := nullif(trim(p_payload->>'sale_date'), '');
  if v_day is not null and v_day ~ '^\d{4}-\d{2}-\d{2}$' then
    v_new_sold_at := (v_day || 'T12:00:00.000Z')::timestamptz;
  else
    v_new_sold_at := v_old.sold_at;
  end if;

  v_new_customer := case when p_payload ? 'customer_name' then nullif(trim(p_payload->>'customer_name'), '') else v_old.customer_name end;
  v_new_notes := case when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '') else v_old.notes end;

  if v_old.inventory_item_id::text <= v_new_item::text then
    v_id_a := v_old.inventory_item_id;
    v_id_b := v_new_item;
  else
    v_id_a := v_new_item;
    v_id_b := v_old.inventory_item_id;
  end if;

  for v_lock_id in select unnest(array[v_id_a, v_id_b])
  loop
    perform 1 from public.inventory_items where id = v_lock_id for update;
  end loop;

  select i.deleted_at into v_new_deleted
  from public.inventory_items i
  where i.id = v_new_item;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;
  if v_new_deleted is not null and v_new_item is distinct from v_old.inventory_item_id then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  perform public.assert_inventory_item_sellable(v_new_item, v_new_price);

  v_before := jsonb_build_object(
    'inventory_item_id', v_old.inventory_item_id,
    'qty', v_old.qty,
    'unit_price_cents', v_old.unit_price_cents,
    'unit_cost_cents', v_old.unit_cost_cents,
    'currency', v_old.currency,
    'sold_at', v_old.sold_at,
    'customer_name', v_old.customer_name,
    'notes', v_old.notes,
    'revenue_usd_equiv_cents', v_old.revenue_usd_equiv_cents,
    'gross_profit_usd_cents', v_old.gross_profit_usd_cents
  );

  perform public.apply_inventory_qty_delta(
    v_old.inventory_item_id,
    v_old.qty,
    'sale_edit_restore',
    'sale',
    v_sale_id,
    format('Sale edit restore (%s)', v_reason)
  );

  select coalesce(nullif(i.fx_ngn_per_usd, 0), public.operational_ngn_per_usd())
    into v_fx_ngn
  from public.inventory_items i
  where i.id = v_new_item;

  perform public.apply_inventory_qty_delta(
    v_new_item,
    -v_new_qty,
    'sale_edit_deduct',
    'sale',
    v_sale_id,
    format('Sale edit deduct (%s)', v_reason)
  );

  v_wac_usd := public.resolve_inventory_unit_cost_usd_cents(v_new_item);
  v_rev_usd := public.compute_sale_revenue_usd_cents(v_new_qty, v_new_price, v_new_currency, v_fx_ngn);
  if v_wac_usd is null then
    v_gp_usd := null;
  else
    v_gp_usd := v_rev_usd - round(v_new_qty * v_wac_usd);
  end if;

  update public.sales
  set
    inventory_item_id = v_new_item,
    qty = v_new_qty,
    unit_price_cents = v_new_price,
    unit_cost_cents = v_wac_usd,
    currency = v_new_currency,
    sold_at = v_new_sold_at,
    customer_name = v_new_customer,
    notes = v_new_notes,
    revenue_usd_equiv_cents = v_rev_usd,
    gross_profit_usd_cents = v_gp_usd
  where id = v_sale_id;

  v_after := jsonb_build_object(
    'inventory_item_id', v_new_item,
    'qty', v_new_qty,
    'unit_price_cents', v_new_price,
    'unit_cost_cents', v_wac_usd,
    'currency', v_new_currency,
    'sold_at', v_new_sold_at,
    'customer_name', v_new_customer,
    'notes', v_new_notes,
    'revenue_usd_equiv_cents', v_rev_usd,
    'gross_profit_usd_cents', v_gp_usd
  );

  insert into public.sales_edit_log (sale_id, edited_by, edit_reason, before_values, after_values)
  values (v_sale_id, v_uid, v_reason, v_before, v_after)
  returning id into v_log_id;

  return v_log_id;
exception
  when others then
    if sqlerrm in (
      'unauthorized', 'sale_not_found', 'product_not_found', 'insufficient_stock',
      'invalid_currency', 'invalid_price', 'invalid_quantity', 'edit_reason_required'
    )
      or sqlerrm like 'product_needs_setup:%'
      or sqlerrm like 'product_not_sellable:%'
      or sqlerrm like 'product_missing_retail_price:%'
    then
      raise;
    end if;
    raise exception 'transaction_failed' using errcode = 'P0001';
end;
$$;

revoke all on function public.resolve_inventory_unit_cost_usd_cents(uuid) from public;
grant execute on function public.resolve_inventory_unit_cost_usd_cents(uuid) to authenticated;
