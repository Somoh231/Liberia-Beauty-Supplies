-- =============================================================================
-- Operational clean restart: FX contract, sale-edit harden, catalog seed,
-- owner-only sales+inventory reset (atomic). Does NOT auto-execute reset.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- FX helpers — baselines 1385 NGN / 190 LRD; no legacy 1550
-- ---------------------------------------------------------------------------
create or replace function public.operational_ngn_per_usd()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.ngn_per_usd
      from public.operational_settings s
      where s.id = 1
        and s.ngn_per_usd is not null
        and s.ngn_per_usd > 0
    ),
    1385::numeric
  );
$$;

create or replace function public.operational_lrd_per_usd()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select s.lrd_per_usd
      from public.operational_settings s
      where s.id = 1
        and s.lrd_per_usd is not null
        and s.lrd_per_usd > 0
    ),
    190::numeric
  );
$$;

create or replace function public.purchase_unit_cost_to_usd_cents(
  p_unit_cost_cents bigint,
  p_currency text,
  p_fx_ngn_per_usd numeric,
  p_item_fx_ngn_per_usd numeric,
  p_item_landed_usd_cents bigint
)
returns bigint
language plpgsql
stable
as $$
declare
  v_fx numeric;
  v_base_usd bigint;
begin
  v_fx := coalesce(nullif(p_fx_ngn_per_usd, 0), nullif(p_item_fx_ngn_per_usd, 0), public.operational_ngn_per_usd());

  if p_currency = 'USD' then
    v_base_usd := p_unit_cost_cents;
  elsif p_currency = 'NGN' then
    v_base_usd := round(p_unit_cost_cents::numeric / v_fx)::bigint;
  elsif p_currency = 'LRD' then
    v_base_usd := round(p_unit_cost_cents::numeric / public.operational_lrd_per_usd())::bigint;
  else
    v_base_usd := p_unit_cost_cents;
  end if;

  return greatest(0, v_base_usd + coalesce(p_item_landed_usd_cents, 0));
end;
$$;

-- Canonical sale revenue / GP (always authoritative — ignore client-supplied values)
create or replace function public.compute_sale_revenue_usd_cents(
  p_qty numeric,
  p_unit_price_cents bigint,
  p_currency text,
  p_fx_ngn numeric
)
returns bigint
language plpgsql
stable
as $$
begin
  if p_currency = 'USD' then
    return round(p_qty * p_unit_price_cents);
  elsif p_currency = 'LRD' then
    return round((p_qty * p_unit_price_cents)::numeric / public.operational_lrd_per_usd());
  elsif p_currency = 'NGN' then
    return round((p_qty * p_unit_price_cents)::numeric / coalesce(nullif(p_fx_ngn, 0), public.operational_ngn_per_usd()));
  end if;
  return round(p_qty * p_unit_price_cents);
end;
$$;

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

  -- WAC is canonical cost basis for GP; snapshot on the sale row
  new.unit_cost_cents := v_wac_usd;

  v_rev_usd := public.compute_sale_revenue_usd_cents(new.qty, new.unit_price_cents, new.currency, v_fx_ngn);
  new.revenue_usd_equiv_cents := v_rev_usd;
  -- Preserve negative GP (do not clamp to zero)
  new.gross_profit_usd_cents := v_rev_usd - round(new.qty * v_wac_usd);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_inventory_qty_delta — allow archived SKUs (sale edits / reset restore)
-- ---------------------------------------------------------------------------
create or replace function public.apply_inventory_qty_delta(
  p_item_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before numeric(14, 4);
  v_after numeric(14, 4);
begin
  if p_delta = 0 then
    return;
  end if;

  select i.quantity_on_hand
    into strict v_before
  from public.inventory_items i
  where i.id = p_item_id
  for update;

  v_after := v_before + p_delta;
  if v_after < -1e-9 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  perform set_config('salon.movement_type', p_movement_type, true);
  perform set_config('salon.movement_reference_type', coalesce(p_reference_type, ''), true);
  perform set_config('salon.movement_reference_id', coalesce(p_reference_id::text, ''), true);
  perform set_config('salon.movement_notes', left(coalesce(p_notes, ''), 2000), true);

  update public.inventory_items
  set quantity_on_hand = v_after,
      updated_at = now()
  where id = p_item_id;

  perform set_config('salon.movement_type', '', true);
  perform set_config('salon.movement_reference_type', '', true);
  perform set_config('salon.movement_reference_id', '', true);
  perform set_config('salon.movement_notes', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hardened admin_edit_retail_sale
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

  -- Deterministic lock order for inventory rows
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

  -- Replacement must be non-deleted unless it is the same archived original
  select i.deleted_at into v_new_deleted
  from public.inventory_items i
  where i.id = v_new_item;

  if not found then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;
  if v_new_deleted is not null and v_new_item is distinct from v_old.inventory_item_id then
    raise exception 'product_not_found' using errcode = 'P0001';
  end if;

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

  -- Restore original (works for archived original SKU)
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
    ) then
      raise;
    end if;
    if sqlerrm = 'insufficient_stock' or sqlstate = 'P0001' and sqlerrm like '%insufficient%' then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end if;
    raise exception 'transaction_failed' using errcode = 'P0001';
end;
$$;

comment on function public.admin_edit_retail_sale(jsonb) is
  'Manager/owner sale correction: lock ordered inventory, restore/deduct, WAC cost basis, negative GP preserved, audit log.';

-- ---------------------------------------------------------------------------
-- Reconciliation supersession (preserve history; exclude from live totals)
-- ---------------------------------------------------------------------------
alter table public.daily_cash_reconciliations
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_reset_id uuid,
  add column if not exists dataset_label text;

comment on column public.daily_cash_reconciliations.superseded_at is
  'When set, row belongs to a prior operating dataset and must not drive live dashboard totals.';

-- Allow one live reconciliation per business day; superseded history may coexist
alter table public.daily_cash_reconciliations
  drop constraint if exists daily_recon_one_per_day;
drop index if exists daily_recon_one_live_per_day;
create unique index daily_recon_one_live_per_day
  on public.daily_cash_reconciliations (business_date)
  where superseded_at is null;

-- ---------------------------------------------------------------------------
-- Operational dataset reset audit
-- ---------------------------------------------------------------------------
create table if not exists public.operational_dataset_reset_log (
  id uuid primary key default gen_random_uuid(),
  reset_by uuid references auth.users (id) on delete set null,
  reset_at timestamptz not null default now(),
  reason text not null,
  backup_confirmed boolean not null default false,
  backup_reference text,
  workbook_filename text,
  workbook_sha256 text,
  deleted_counts jsonb not null default '{}'::jsonb,
  preserved_tables jsonb not null default '[]'::jsonb,
  fx_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists operational_dataset_reset_log_reset_at_idx
  on public.operational_dataset_reset_log (reset_at desc);

alter table public.operational_dataset_reset_log enable row level security;

drop policy if exists "operational_dataset_reset_log_select_admin" on public.operational_dataset_reset_log;
create policy "operational_dataset_reset_log_select_admin"
  on public.operational_dataset_reset_log for select
  to authenticated
  using (public.is_salon_portal_admin());

alter table public.daily_cash_reconciliations
  drop constraint if exists daily_cash_reconciliations_superseded_by_fk;
alter table public.daily_cash_reconciliations
  add constraint daily_cash_reconciliations_superseded_by_fk
  foreign key (superseded_by_reset_id) references public.operational_dataset_reset_log (id)
  on delete set null;

-- Preview counts (read-only)
create or replace function public.admin_preview_operational_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_salon_owner() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'sales', (select count(*)::int from public.sales),
    'sales_edit_log', (select count(*)::int from public.sales_edit_log),
    'inventory_items', (select count(*)::int from public.inventory_items),
    'inventory_movements', (select count(*)::int from public.inventory_movements),
    'inventory_correction_log', (select count(*)::int from public.inventory_correction_log),
    'inventory_import_batches', (select count(*)::int from public.inventory_import_batches),
    'purchases', (select count(*)::int from public.purchases),
    'purchase_lines', (select count(*)::int from public.purchase_lines),
    'weekly_product_sales', (select count(*)::int from public.weekly_product_sales),
    'service_logs_with_product_usage', (
      select count(*)::int from public.service_logs
      where product_usage is not null and jsonb_array_length(product_usage) > 0
    ),
    'reconciliations_live', (
      select count(*)::int from public.daily_cash_reconciliations
      where superseded_at is null
    ),
    'preserved', jsonb_build_array(
      'auth.users', 'user_profiles', 'suppliers', 'service_logs',
      'space_lease_payments', 'operational_settings', 'daily_cash_reconciliations',
      'UI/routes', 'RBAC'
    ),
    'fx', jsonb_build_object(
      'ngn_per_usd', public.operational_ngn_per_usd(),
      'lrd_per_usd', public.operational_lrd_per_usd()
    )
  );
end;
$$;

revoke all on function public.admin_preview_operational_reset() from public;
grant execute on function public.admin_preview_operational_reset() to authenticated;

-- Atomic owner reset
create or replace function public.admin_reset_sales_and_inventory(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := trim(coalesce(p_payload->>'reason', ''));
  v_confirm text := trim(coalesce(p_payload->>'confirmation', ''));
  v_backup_ok boolean := coalesce((p_payload->>'backup_confirmed')::boolean, false);
  v_backup_ref text := nullif(trim(coalesce(p_payload->>'backup_reference', '')), '');
  v_workbook text := nullif(trim(coalesce(p_payload->>'workbook_filename', '')), '');
  v_hash text := nullif(trim(coalesce(p_payload->>'workbook_sha256', '')), '');
  v_log_id uuid;
  v_counts jsonb;
  v_n int;
begin
  if v_uid is null or not public.is_salon_owner() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_confirm is distinct from 'RESET SALES AND INVENTORY' then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if not v_backup_ok then
    raise exception 'backup_confirmation_required' using errcode = 'P0001';
  end if;

  v_counts := public.admin_preview_operational_reset();

  insert into public.operational_dataset_reset_log (
    reset_by, reason, backup_confirmed, backup_reference,
    workbook_filename, workbook_sha256, deleted_counts, preserved_tables, fx_snapshot
  ) values (
    v_uid,
    v_reason,
    true,
    v_backup_ref,
    v_workbook,
    v_hash,
    v_counts,
    v_counts->'preserved',
    v_counts->'fx'
  )
  returning id into v_log_id;

  -- Mark reconciliations as prior dataset (do not delete)
  update public.daily_cash_reconciliations
  set
    superseded_at = now(),
    superseded_by_reset_id = v_log_id,
    dataset_label = coalesce(dataset_label, 'pre-reset')
  where superseded_at is null;

  -- Detach service product_usage inventory refs; keep service revenue
  update public.service_logs
  set product_usage = '[]'::jsonb
  where product_usage is not null
    and jsonb_typeof(product_usage) = 'array'
    and jsonb_array_length(product_usage) > 0;

  -- Sales first (cascades sales_edit_log)
  delete from public.sales;

  -- Purchases / lines
  if to_regclass('public.purchase_lines') is not null then
    delete from public.purchase_lines;
  end if;
  if to_regclass('public.purchases') is not null then
    delete from public.purchases;
  end if;

  -- Legacy weekly product sales tied to inventory
  if to_regclass('public.weekly_product_sales') is not null then
    delete from public.weekly_product_sales;
  end if;

  -- Movements & correction logs (also cascade from items, but clear explicitly)
  if to_regclass('public.inventory_movements') is not null then
    delete from public.inventory_movements;
  end if;
  if to_regclass('public.inventory_correction_log') is not null then
    delete from public.inventory_correction_log;
  end if;

  -- Clear import batch links then batches
  update public.inventory_items set import_batch_id = null where import_batch_id is not null;
  if to_regclass('public.inventory_import_batches') is not null then
    delete from public.inventory_import_batches;
  end if;

  -- Soft-clear catalog reset log is separate; keep operational_dataset_reset_log

  delete from public.inventory_items;

  get diagnostics v_n = row_count;

  update public.operational_dataset_reset_log
  set deleted_counts = v_counts || jsonb_build_object('inventory_items_deleted', v_n, 'reset_id', v_log_id)
  where id = v_log_id;

  return v_log_id;
end;
$$;

comment on function public.admin_reset_sales_and_inventory(jsonb) is
  'Owner-only atomic reset of retail sales + inventory dataset. Preserves users, suppliers, services, leases, settings, reconciliations (superseded).';

revoke all on function public.admin_reset_sales_and_inventory(jsonb) from public;
grant execute on function public.admin_reset_sales_and_inventory(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Catalog-only workbook seed (names + categories; no financial import)
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
      supplier_id
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
      null
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
  'Manager/owner catalog-only seed: category + product name, qty/cost/price empty for manual setup.';

revoke all on function public.commit_inventory_catalog_seed(jsonb) from public;
grant execute on function public.commit_inventory_catalog_seed(jsonb) to authenticated;

-- Keep financial import RPC but force FX baseline (no 1550)
create or replace function public.commit_inventory_workbook_import(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_archive boolean := coalesce((p_payload->>'archive_existing')::boolean, true);
  v_filename text := coalesce(nullif(trim(p_payload->>'filename'), ''), 'workbook-import');
  v_fx_ngn numeric := coalesce((p_payload->>'fx_ngn_per_usd')::numeric, public.operational_ngn_per_usd());
  v_fx_lrd numeric := coalesce((p_payload->>'fx_lrd_per_usd')::numeric, public.operational_lrd_per_usd());
  v_parent uuid := nullif(trim(p_payload->>'parent_batch_id'), '')::uuid;
  v_import_rows jsonb := coalesce(p_payload->'import_rows', '[]'::jsonb);
  v_unresolved jsonb := coalesce(p_payload->'unresolved_rows', '[]'::jsonb);
  v_row jsonb;
  v_archived int := 0;
  v_imported int := 0;
  v_warnings int := 0;
  v_unresolved_count int := 0;
  v_skipped int := coalesce((p_payload->>'skipped_count')::int, 0);
  v_errors int := coalesce((p_payload->>'error_count')::int, 0);
  v_cat_totals jsonb := coalesce(p_payload->'category_totals', '{}'::jsonb);
  v_notes text;
  v_qty numeric;
  v_retail bigint;
  v_wac bigint;
  v_sell_usd bigint;
  v_sell_lrd bigint;
  v_cat text;
  v_status text;
  v_pname text;
begin
  if not public.is_salon_portal_admin() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_fx_ngn <= 0 then
    raise exception 'invalid_fx_ngn' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_import_rows) = 0 then
    raise exception 'no_import_rows' using errcode = 'P0001';
  end if;

  insert into public.inventory_import_batches (
    filename, imported_by, status, fx_snapshot, unresolved_rows, skipped_review_required, parent_batch_id
  ) values (
    v_filename, v_uid, 'in_progress',
    jsonb_build_object('ngn_per_usd', v_fx_ngn, 'lrd_per_usd', v_fx_lrd),
    v_unresolved, v_unresolved, v_parent
  )
  returning id into v_batch_id;

  if v_archive then
    update public.inventory_items
    set active = false, deleted_at = coalesce(deleted_at, now()), updated_at = now()
    where deleted_at is null;
    get diagnostics v_archived = row_count;
  end if;

  for v_row in select value from jsonb_array_elements(v_import_rows) as t(value)
  loop
    v_status := coalesce(v_row->>'validation_status', 'error');
    if v_status not in ('ok', 'warning') then
      raise exception 'invalid_row_status' using errcode = 'P0001';
    end if;
    v_pname := trim(coalesce(v_row->>'product_name', ''));
    if length(v_pname) < 2 then
      raise exception 'invalid_product_name' using errcode = 'P0001';
    end if;
    v_qty := (v_row->>'quantity')::numeric;
    v_retail := (v_row->>'retail_ngn_cents')::bigint;
    if v_qty is null or v_qty < 0 or v_retail is null or v_retail <= 0 then
      raise exception 'invalid_import_row' using errcode = 'P0001';
    end if;
    v_sell_usd := coalesce((v_row->>'sell_usd_cents')::bigint, 0);
    v_sell_lrd := coalesce((v_row->>'sell_lrd_cents')::bigint, 0);
    v_wac := round(v_retail::numeric / v_fx_ngn)::bigint;
    v_notes := nullif(trim(coalesce(v_row->>'notes', '')), '');
    v_cat := nullif(trim(coalesce(v_row->>'category', '')), '');

    insert into public.inventory_items (
      product_name, name, unit, quantity_on_hand, reorder_level, reorder_point, low_stock_threshold,
      avg_unit_cost_cents, cost_currency, default_unit_price_cents, default_price_currency,
      fx_ngn_per_usd, landed_usd_cents_per_unit, weighted_avg_landed_usd_cents,
      sell_price_usd_cents, sell_price_lrd_cents, store_price_usd_cents,
      category, notes, active, import_batch_id
    ) values (
      v_pname, v_pname, coalesce(nullif(trim(v_row->>'unit'), ''), 'each'), v_qty, 5, 5, 5,
      v_retail, 'NGN', v_retail, 'NGN', v_fx_ngn, 0, v_wac,
      nullif(v_sell_usd, 0), nullif(v_sell_lrd, 0), nullif(v_sell_usd, 0),
      v_cat, v_notes, true, v_batch_id
    );
    v_imported := v_imported + 1;
    if v_status = 'warning' then v_warnings := v_warnings + 1; end if;
  end loop;

  v_unresolved_count := jsonb_array_length(v_unresolved);
  update public.inventory_import_batches
  set status = 'completed', completed_at = now(), archived_count = v_archived,
      imported_count = v_imported, skipped_count = v_skipped, unresolved_count = v_unresolved_count,
      warning_count = v_warnings, error_count = v_errors, category_totals = v_cat_totals
  where id = v_batch_id;

  return v_batch_id;
end;
$$;
