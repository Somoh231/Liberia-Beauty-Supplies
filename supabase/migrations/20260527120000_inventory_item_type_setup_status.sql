-- =============================================================================
-- Inventory item_type + setup_status, catalog seed wiring, sale sellability guards
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists item_type text,
  add column if not exists setup_status text;

-- Backfill before NOT NULL / checks
update public.inventory_items
set item_type = coalesce(nullif(trim(item_type), ''), 'retail')
where item_type is null or trim(item_type) = '';

update public.inventory_items
set setup_status = coalesce(nullif(trim(setup_status), ''), 'needs_setup')
where setup_status is null or trim(setup_status) = '';

-- Mark known fixed assets by trimmed case-insensitive product name
update public.inventory_items
set item_type = 'asset'
where lower(trim(coalesce(product_name, name, ''))) in (
  'makeup chair',
  'lash bed',
  'spa stool',
  'pink nail table',
  'customer chair',
  'nail tech chair',
  'pedicure chair',
  'trolley',
  'nail light',
  'hand rest',
  'led light',
  'industrial machine'
)
or lower(trim(coalesce(product_name, name, ''))) like 'industrial machine%';

-- Existing retail rows with required setup fields → ready; otherwise leave needs_setup
update public.inventory_items i
set setup_status = 'ready'
where i.item_type = 'retail'
  and i.supplier_id is not null
  and (
    coalesce(i.weighted_avg_landed_usd_cents, 0) > 0
    or coalesce(i.avg_unit_cost_cents, 0) > 0
    or coalesce(i.landed_usd_cents_per_unit, 0) > 0
  )
  and (
    coalesce(i.sell_price_usd_cents, 0) > 0
    or coalesce(i.sell_price_lrd_cents, 0) > 0
    or coalesce(i.store_price_usd_cents, 0) > 0
  )
  and i.quantity_on_hand is not null;

-- Assets do not require sale setup fields
update public.inventory_items
set setup_status = 'ready'
where item_type = 'asset';

alter table public.inventory_items
  alter column item_type set default 'retail',
  alter column item_type set not null,
  alter column setup_status set default 'needs_setup',
  alter column setup_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_item_type_check'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_item_type_check
      check (item_type in ('retail', 'asset'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_items_setup_status_check'
  ) then
    alter table public.inventory_items
      add constraint inventory_items_setup_status_check
      check (setup_status in ('needs_setup', 'ready'));
  end if;
end $$;

comment on column public.inventory_items.item_type is
  'retail = normal sellable product stock; asset = furniture/equipment/internal asset visible in inventory but not sellable.';

comment on column public.inventory_items.setup_status is
  'needs_setup = cannot be sold until required setup fields are complete; ready = can be sold if active, retail, priced, and stocked per normal rules.';

create index if not exists inventory_items_setup_status_idx
  on public.inventory_items (setup_status)
  where deleted_at is null;

create index if not exists inventory_items_item_type_idx
  on public.inventory_items (item_type)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.inventory_asset_name_match(p_name text)
returns boolean
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_name, '')), '') is null then false
    when lower(trim(p_name)) in (
      'makeup chair',
      'lash bed',
      'spa stool',
      'pink nail table',
      'customer chair',
      'nail tech chair',
      'pedicure chair',
      'trolley',
      'nail light',
      'hand rest',
      'led light',
      'industrial machine'
    ) then true
    when lower(trim(p_name)) like 'industrial machine%' then true
    else false
  end;
$$;

comment on function public.inventory_asset_name_match(text) is
  'True when trimmed product name matches the fixed-asset catalog list (case-insensitive; Industrial Machine prefix allowed).';

create or replace function public.inventory_retail_setup_complete(
  p_quantity_on_hand numeric,
  p_supplier_id uuid,
  p_avg_unit_cost_cents bigint,
  p_weighted_avg_landed_usd_cents bigint,
  p_landed_usd_cents_per_unit bigint,
  p_sell_price_usd_cents bigint,
  p_sell_price_lrd_cents bigint,
  p_store_price_usd_cents bigint
)
returns boolean
language sql
immutable
as $$
  select
    p_quantity_on_hand is not null
    and p_supplier_id is not null
    and (
      coalesce(p_weighted_avg_landed_usd_cents, 0) > 0
      or coalesce(p_avg_unit_cost_cents, 0) > 0
      or coalesce(p_landed_usd_cents_per_unit, 0) > 0
    )
    and (
      coalesce(p_sell_price_usd_cents, 0) > 0
      or coalesce(p_sell_price_lrd_cents, 0) > 0
      or coalesce(p_store_price_usd_cents, 0) > 0
    );
$$;

create or replace function public.derive_inventory_setup_status(
  p_item_type text,
  p_quantity_on_hand numeric,
  p_supplier_id uuid,
  p_avg_unit_cost_cents bigint,
  p_weighted_avg_landed_usd_cents bigint,
  p_landed_usd_cents_per_unit bigint,
  p_sell_price_usd_cents bigint,
  p_sell_price_lrd_cents bigint,
  p_store_price_usd_cents bigint
)
returns text
language plpgsql
immutable
as $$
begin
  if coalesce(p_item_type, 'retail') = 'asset' then
    return 'ready';
  end if;
  if public.inventory_retail_setup_complete(
    p_quantity_on_hand,
    p_supplier_id,
    p_avg_unit_cost_cents,
    p_weighted_avg_landed_usd_cents,
    p_landed_usd_cents_per_unit,
    p_sell_price_usd_cents,
    p_sell_price_lrd_cents,
    p_store_price_usd_cents
  ) then
    return 'ready';
  end if;
  return 'needs_setup';
end;
$$;

comment on function public.derive_inventory_setup_status is
  'Conservative setup_status: assets are ready; retail becomes ready only with qty present, supplier, cost/WAC basis, and at least one retail price.';

create or replace function public.assert_inventory_item_sellable(
  p_item_id uuid,
  p_unit_price_cents bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_type text;
  v_setup text;
  v_active boolean;
  v_deleted timestamptz;
begin
  select
    coalesce(nullif(trim(i.product_name), ''), nullif(trim(i.name), ''), 'Unknown product'),
    i.item_type,
    i.setup_status,
    i.active,
    i.deleted_at
  into v_name, v_type, v_setup, v_active, v_deleted
  from public.inventory_items i
  where i.id = p_item_id;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  if v_deleted is not null or v_active is not true then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

  if v_type = 'asset' then
    raise exception 'product_not_sellable: %', v_name using errcode = 'P0001';
  end if;

  if v_setup = 'needs_setup' then
    raise exception 'product_needs_setup: %', v_name using errcode = 'P0001';
  end if;

  if p_unit_price_cents is null or p_unit_price_cents <= 0 then
    raise exception 'product_missing_retail_price: %', v_name using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_inventory_item_sellable(uuid, bigint) is
  'Server-side sale guard: rejects assets, needs_setup products, and null/zero sale prices. Exception text includes product name.';

-- ---------------------------------------------------------------------------
-- Sale create guard (before-insert trigger)
-- ---------------------------------------------------------------------------
create or replace function public.trg_sales_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric(14, 4);
  v_wac_usd bigint;
  v_avg_cost bigint;
  v_rev_usd bigint;
  v_fx_ngn numeric;
begin
  perform public.assert_inventory_item_sellable(new.inventory_item_id, new.unit_price_cents);

  select i.quantity_on_hand,
         coalesce(nullif(i.weighted_avg_landed_usd_cents, 0), 0),
         i.avg_unit_cost_cents,
         coalesce(nullif(i.fx_ngn_per_usd, 0), public.operational_ngn_per_usd())
    into strict v_qty, v_wac_usd, v_avg_cost, v_fx_ngn
  from public.inventory_items i
  where i.id = new.inventory_item_id
  for update;

  if v_qty + 1e-9 < new.qty then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  new.unit_cost_cents := v_wac_usd;

  v_rev_usd := public.compute_sale_revenue_usd_cents(new.qty, new.unit_price_cents, new.currency, v_fx_ngn);
  new.revenue_usd_equiv_cents := v_rev_usd;
  new.gross_profit_usd_cents := v_rev_usd - round(new.qty * v_wac_usd);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sale edit guard (replacement / price change)
-- ---------------------------------------------------------------------------
create or replace function public.admin_edit_retail_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sale_id uuid := nullif(trim(p_payload->>'sale_id'), '')::uuid;
  v_reason text := trim(coalesce(p_payload->>'edit_reason', ''));
  v_old public.sales%rowtype;
  v_new_item uuid := nullif(trim(p_payload->>'inventory_item_id'), '')::uuid;
  v_new_qty numeric(14, 4);
  v_new_price bigint;
  v_new_currency text;
  v_new_sold_at timestamptz;
  v_new_customer text;
  v_new_notes text;
  v_fx_ngn numeric;
  v_wac_usd bigint;
  v_rev_usd bigint;
  v_gp_usd bigint;
  v_log_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_day text;
  v_id_a uuid;
  v_id_b uuid;
  v_lock_id uuid;
  v_new_deleted timestamptz;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not public.is_salon_portal_admin() then
    raise exception 'unauthorized' using errcode = '42501';
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

  v_new_item := coalesce(v_new_item, v_old.inventory_item_id);
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

  -- Guard replacement (and same-item price) against needs_setup / asset / zero price
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

  select coalesce(nullif(i.weighted_avg_landed_usd_cents, 0), 0),
         coalesce(nullif(i.fx_ngn_per_usd, 0), public.operational_ngn_per_usd())
    into v_wac_usd, v_fx_ngn
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

  v_rev_usd := public.compute_sale_revenue_usd_cents(v_new_qty, v_new_price, v_new_currency, v_fx_ngn);
  v_gp_usd := v_rev_usd - round(v_new_qty * v_wac_usd);

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
    if sqlerrm = 'insufficient_stock' or sqlstate = 'P0001' and sqlerrm like '%insufficient%' then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
    raise exception 'transaction_failed' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory correction recomputes setup_status (and may set asset via name)
-- ---------------------------------------------------------------------------
create or replace function public.admin_correct_inventory_item(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(trim(p_payload->>'inventory_item_id'), '')::uuid;
  v_old public.inventory_items%rowtype;
  v_reason text := trim(coalesce(p_payload->>'audit_reason', ''));
  v_mov_type text := coalesce(nullif(trim(p_payload->>'movement_type'), ''), 'manual_adjustment');
  v_log_id uuid;
  v_qty numeric(14, 4);
  v_cost bigint;
  v_cc text;
  v_def_price bigint;
  v_def_cur text;
  v_fx numeric;
  v_landed bigint;
  v_store bigint;
  v_sell_usd bigint;
  v_sell_lrd bigint;
  v_wac bigint;
  v_active boolean;
  v_archived boolean;
  v_is_addon boolean;
  v_qty_changed boolean;
  v_pricing_changed boolean;
  v_status_changed boolean;
  v_pname text;
  v_supplier uuid;
  v_item_type text;
  v_setup text;
begin
  if not public.is_salon_portal_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'invalid_inventory_item_id' using errcode = 'P0001';
  end if;
  if v_mov_type not in ('manual_adjustment', 'correction', 'damaged', 'expired') then
    raise exception 'invalid_movement_type' using errcode = 'P0001';
  end if;

  select * into strict v_old from public.inventory_items where id = v_id for update;

  v_pname := trim(coalesce(p_payload->>'product_name', ''));
  if length(v_pname) < 2 then
    raise exception 'invalid_product_name' using errcode = 'P0001';
  end if;

  v_qty := coalesce((p_payload->>'quantity_on_hand')::numeric, v_old.quantity_on_hand);
  if v_qty is null or v_qty < 0 then
    raise exception 'invalid_quantity' using errcode = 'P0001';
  end if;

  v_cost := coalesce((p_payload->>'avg_unit_cost_cents')::bigint, v_old.avg_unit_cost_cents);
  v_cc := coalesce(nullif(trim(p_payload->>'cost_currency'), ''), v_old.cost_currency);
  v_def_price := case when p_payload ? 'default_unit_price_cents' then (p_payload->>'default_unit_price_cents')::bigint else v_old.default_unit_price_cents end;
  v_def_cur := coalesce(nullif(trim(p_payload->>'default_price_currency'), ''), v_old.default_price_currency);
  v_fx := case when p_payload ? 'fx_ngn_per_usd' then (p_payload->>'fx_ngn_per_usd')::numeric else v_old.fx_ngn_per_usd end;
  v_landed := coalesce((p_payload->>'landed_usd_cents_per_unit')::bigint, coalesce(v_old.landed_usd_cents_per_unit, 0));
  v_store := case when p_payload ? 'store_price_usd_cents' then (p_payload->>'store_price_usd_cents')::bigint else v_old.store_price_usd_cents end;
  v_sell_usd := case when p_payload ? 'sell_price_usd_cents' then (p_payload->>'sell_price_usd_cents')::bigint else v_old.sell_price_usd_cents end;
  v_sell_lrd := case when p_payload ? 'sell_price_lrd_cents' then (p_payload->>'sell_price_lrd_cents')::bigint else v_old.sell_price_lrd_cents end;
  v_wac := case when p_payload ? 'weighted_avg_landed_usd_cents' then (p_payload->>'weighted_avg_landed_usd_cents')::bigint else v_old.weighted_avg_landed_usd_cents end;
  v_active := coalesce((p_payload->>'active')::boolean, v_old.active);
  v_archived := coalesce((p_payload->>'archived')::boolean, v_old.deleted_at is not null);
  v_is_addon := coalesce((p_payload->>'is_addon')::boolean, coalesce(v_old.is_addon, false));

  v_supplier := case
    when nullif(trim(p_payload->>'supplier_id'), '') is not null then (p_payload->>'supplier_id')::uuid
    else v_old.supplier_id
  end;

  v_item_type := coalesce(
    nullif(trim(p_payload->>'item_type'), ''),
    case when public.inventory_asset_name_match(v_pname) then 'asset' else v_old.item_type end
  );
  if v_item_type not in ('retail', 'asset') then
    v_item_type := 'retail';
  end if;
  if public.inventory_asset_name_match(v_pname) then
    v_item_type := 'asset';
  end if;

  v_setup := public.derive_inventory_setup_status(
    v_item_type,
    v_qty,
    v_supplier,
    v_cost,
    coalesce(v_wac, 0),
    v_landed,
    v_sell_usd,
    v_sell_lrd,
    v_store
  );

  v_qty_changed := v_old.quantity_on_hand is distinct from v_qty;
  v_pricing_changed :=
    v_old.avg_unit_cost_cents is distinct from v_cost
    or v_old.cost_currency is distinct from v_cc
    or v_old.default_unit_price_cents is distinct from v_def_price
    or v_old.default_price_currency is distinct from v_def_cur
    or v_old.fx_ngn_per_usd is distinct from v_fx
    or coalesce(v_old.landed_usd_cents_per_unit, 0) is distinct from v_landed
    or v_old.store_price_usd_cents is distinct from v_store
    or v_old.sell_price_usd_cents is distinct from v_sell_usd
    or v_old.sell_price_lrd_cents is distinct from v_sell_lrd
    or coalesce(v_old.weighted_avg_landed_usd_cents, 0) is distinct from coalesce(v_wac, 0);
  v_status_changed :=
    v_old.active is distinct from v_active
    or (v_old.deleted_at is not null) is distinct from v_archived
    or v_old.item_type is distinct from v_item_type
    or v_old.setup_status is distinct from v_setup;

  if (v_qty_changed or v_pricing_changed or v_status_changed) and length(v_reason) < 3 then
    raise exception 'audit_reason_required' using errcode = 'P0001';
  end if;

  if v_qty_changed then
    perform set_config('salon.movement_type', v_mov_type, true);
    perform set_config('salon.movement_reference_type', 'admin_correction', true);
    perform set_config('salon.movement_notes', left(v_reason, 2000), true);
  end if;

  update public.inventory_items
  set
    product_name = v_pname,
    name = v_pname,
    sku = nullif(trim(coalesce(p_payload->>'sku', v_old.sku)), ''),
    unit = coalesce(nullif(left(trim(coalesce(p_payload->>'unit', v_old.unit)), 32), ''), 'each'),
    supplier_id = v_supplier,
    category = nullif(trim(coalesce(p_payload->>'category', v_old.category)), ''),
    notes = nullif(trim(coalesce(p_payload->>'notes', v_old.notes)), ''),
    reorder_level = coalesce((p_payload->>'reorder_level')::numeric, v_old.reorder_level),
    reorder_point = coalesce((p_payload->>'reorder_level')::numeric, v_old.reorder_point),
    low_stock_threshold = coalesce((p_payload->>'low_stock_threshold')::numeric, v_old.low_stock_threshold),
    quantity_on_hand = v_qty,
    avg_unit_cost_cents = v_cost,
    cost_currency = v_cc,
    default_unit_price_cents = v_def_price,
    default_price_currency = v_def_cur,
    fx_ngn_per_usd = v_fx,
    landed_usd_cents_per_unit = v_landed,
    store_price_usd_cents = v_store,
    sell_price_usd_cents = v_sell_usd,
    sell_price_lrd_cents = v_sell_lrd,
    weighted_avg_landed_usd_cents = coalesce(v_wac, 0),
    item_type = v_item_type,
    setup_status = v_setup,
    active = case when v_archived then false else v_active end,
    deleted_at = case
      when v_archived and v_old.deleted_at is null then now()
      when not v_archived then null
      else v_old.deleted_at
    end,
    is_addon = v_is_addon,
    updated_by = v_uid,
    updated_at = now(),
    last_override_at = case when length(v_reason) >= 3 then now() else last_override_at end,
    last_override_by = case when length(v_reason) >= 3 then v_uid else last_override_by end,
    last_override_reason = case when length(v_reason) >= 3 then left(v_reason, 2000) else last_override_reason end
  where id = v_id;

  if v_qty_changed then
    perform set_config('salon.movement_type', '', true);
    perform set_config('salon.movement_reference_type', '', true);
    perform set_config('salon.movement_reference_id', '', true);
    perform set_config('salon.movement_notes', '', true);
  end if;

  insert into public.inventory_correction_log (
    inventory_item_id,
    corrected_by,
    audit_reason,
    movement_type,
    quantity_before,
    quantity_after,
    avg_unit_cost_cents_before,
    avg_unit_cost_cents_after,
    default_unit_price_cents_before,
    default_unit_price_cents_after,
    sell_price_usd_cents_before,
    sell_price_usd_cents_after,
    sell_price_lrd_cents_before,
    sell_price_lrd_cents_after,
    weighted_avg_landed_usd_cents_before,
    weighted_avg_landed_usd_cents_after,
    fx_ngn_per_usd_before,
    fx_ngn_per_usd_after,
    active_before,
    active_after,
    archived_before,
    archived_after,
    change_summary
  ) values (
    v_id,
    v_uid,
    left(v_reason, 2000),
    case when v_qty_changed then v_mov_type else null end,
    v_old.quantity_on_hand,
    v_qty,
    v_old.avg_unit_cost_cents,
    v_cost,
    v_old.default_unit_price_cents,
    v_def_price,
    v_old.sell_price_usd_cents,
    v_sell_usd,
    v_old.sell_price_lrd_cents,
    v_sell_lrd,
    v_old.weighted_avg_landed_usd_cents,
    v_wac,
    v_old.fx_ngn_per_usd,
    v_fx,
    v_old.active,
    case when v_archived then false else v_active end,
    v_old.deleted_at is not null,
    v_archived,
    jsonb_build_object(
      'quantity_changed', v_qty_changed,
      'pricing_changed', v_pricing_changed,
      'status_changed', v_status_changed,
      'item_type_before', v_old.item_type,
      'item_type_after', v_item_type,
      'setup_status_before', v_old.setup_status,
      'setup_status_after', v_setup,
      'cost_currency_before', v_old.cost_currency,
      'cost_currency_after', v_cc,
      'landed_usd_cents_before', coalesce(v_old.landed_usd_cents_per_unit, 0),
      'landed_usd_cents_after', v_landed,
      'store_price_usd_cents_before', v_old.store_price_usd_cents,
      'store_price_usd_cents_after', v_store,
      'is_addon_after', v_is_addon
    )
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog seed writes item_type + setup_status=needs_setup
-- ---------------------------------------------------------------------------
create or replace function public.commit_inventory_catalog_seed(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_archive boolean := coalesce((p_payload->>'archive_existing')::boolean, true);
  v_filename text := coalesce(nullif(trim(p_payload->>'filename'), ''), 'catalog-seed');
  v_import_rows jsonb := coalesce(p_payload->'import_rows', '[]'::jsonb);
  v_unresolved jsonb := coalesce(p_payload->'unresolved_rows', '[]'::jsonb);
  v_row jsonb;
  v_archived int := 0;
  v_imported int := 0;
  v_warnings int := 0;
  v_skipped int := coalesce((p_payload->>'skipped_count')::int, 0);
  v_errors int := coalesce((p_payload->>'error_count')::int, 0);
  v_cat_totals jsonb := coalesce(p_payload->'category_totals', '{}'::jsonb);
  v_pname text;
  v_cat text;
  v_notes text;
  v_status text;
  v_item_type text;
begin
  if not public.is_salon_portal_admin() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if jsonb_array_length(v_import_rows) = 0 then
    raise exception 'no_import_rows' using errcode = 'P0001';
  end if;

  insert into public.inventory_import_batches (
    filename,
    imported_by,
    status,
    fx_snapshot,
    unresolved_rows,
    skipped_review_required,
    parent_batch_id
  ) values (
    v_filename,
    v_uid,
    'in_progress',
    jsonb_build_object(
      'mode', 'catalog',
      'ngn_per_usd', public.operational_ngn_per_usd(),
      'lrd_per_usd', public.operational_lrd_per_usd()
    ),
    v_unresolved,
    v_unresolved,
    nullif(trim(p_payload->>'parent_batch_id'), '')::uuid
  )
  returning id into v_batch_id;

  if v_archive then
    update public.inventory_items
    set
      active = false,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
    where deleted_at is null;
    get diagnostics v_archived = row_count;
  end if;

  for v_row in select value from jsonb_array_elements(v_import_rows) as t(value)
  loop
    v_status := coalesce(v_row->>'validation_status', 'ok');
    if v_status not in ('ok', 'warning') then
      raise exception 'invalid_row_status' using errcode = 'P0001';
    end if;

    v_pname := trim(coalesce(v_row->>'product_name', ''));
    if length(v_pname) < 2 then
      raise exception 'invalid_product_name' using errcode = 'P0001';
    end if;

    v_cat := nullif(trim(coalesce(v_row->>'category', '')), '');
    v_notes := nullif(trim(coalesce(v_row->>'notes', '')), '');

    v_item_type := coalesce(nullif(trim(v_row->>'item_type'), ''), 'retail');
    if v_item_type not in ('retail', 'asset') then
      v_item_type := 'retail';
    end if;
    if public.inventory_asset_name_match(v_pname) then
      v_item_type := 'asset';
    end if;

    insert into public.inventory_items (
      product_name,
      name,
      unit,
      quantity_on_hand,
      reorder_level,
      reorder_point,
      low_stock_threshold,
      avg_unit_cost_cents,
      cost_currency,
      default_unit_price_cents,
      default_price_currency,
      fx_ngn_per_usd,
      landed_usd_cents_per_unit,
      weighted_avg_landed_usd_cents,
      sell_price_usd_cents,
      sell_price_lrd_cents,
      store_price_usd_cents,
      category,
      notes,
      active,
      is_addon,
      import_batch_id,
      supplier_id,
      item_type,
      setup_status
    ) values (
      v_pname,
      v_pname,
      'each',
      0,
      5,
      5,
      5,
      0,
      'USD',
      null,
      'USD',
      null,
      0,
      0,
      null,
      null,
      null,
      v_cat,
      v_notes,
      true,
      false,
      v_batch_id,
      null,
      v_item_type,
      'needs_setup'
    );

    v_imported := v_imported + 1;
    if v_status = 'warning' then
      v_warnings := v_warnings + 1;
    end if;
  end loop;

  update public.inventory_import_batches
  set
    status = 'completed',
    completed_at = now(),
    archived_count = v_archived,
    imported_count = v_imported,
    skipped_count = v_skipped,
    unresolved_count = jsonb_array_length(v_unresolved),
    warning_count = v_warnings,
    error_count = v_errors,
    category_totals = v_cat_totals
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

comment on function public.commit_inventory_catalog_seed(jsonb) is
  'Catalog-only seed: category + name, qty 0, financials empty, setup_status=needs_setup, item_type retail|asset from payload/name.';
