-- =============================================================================
-- Catalog seed: leave operational figures unset (NULL) instead of fake zeros / 5s.
-- Category-first workflow relies on needs_setup + null financials until manual setup.
--
-- Generated columns stock_status / total_stock_value_minor:
--   PostgreSQL cannot ALTER a generated expression in place; columns must be dropped
--   and re-added. DROP COLUMN without CASCADE fails loudly if unexpected dependents
--   exist (views, etc.). Column-owned indexes/constraints are dropped automatically.
--   Known dependents as of this migration: none beyond the columns themselves
--   (prior redefine in 20260427120000_inventory_ngn_weekly_sales_log.sql).
-- =============================================================================

-- Allow unset reorder / low-stock (generated stock_status must tolerate null threshold)
alter table public.inventory_items
  alter column low_stock_threshold drop not null;

alter table public.inventory_items
  alter column avg_unit_cost_cents drop not null;

-- Recreate generated columns safely: no CASCADE (fail if unknown dependents exist).
alter table public.inventory_items drop column if exists stock_status;
alter table public.inventory_items drop column if exists total_stock_value_minor;

alter table public.inventory_items
  add column stock_status text generated always as (
    case
      when coalesce(quantity_on_hand, 0) <= 0 then 'out_of_stock'
      when low_stock_threshold is not null
           and quantity_on_hand <= low_stock_threshold then 'low_stock'
      else 'in_stock'
    end
  ) stored;

alter table public.inventory_items
  add column total_stock_value_minor bigint generated always as (
    round(coalesce(quantity_on_hand, 0) * coalesce(avg_unit_cost_cents, 0)::numeric)::bigint
  ) stored;

comment on column public.inventory_items.stock_status is
  'Generated: out_of_stock | low_stock | in_stock (null low_stock_threshold never triggers low_stock)';

-- Do not force reorder defaults on catalog needs_setup rows
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

  -- Catalog seed / incomplete setup: leave reorder & low-stock unset.
  if coalesce(new.setup_status, 'ready') is distinct from 'needs_setup' then
    if new.reorder_level is null then
      new.reorder_level := coalesce(new.reorder_point, 5);
    end if;
    if new.reorder_point is null then
      new.reorder_point := new.reorder_level;
    end if;
    if new.low_stock_threshold is null then
      new.low_stock_threshold := coalesce(new.reorder_level, 5);
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.commit_inventory_catalog_seed(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  -- Default false: routine catalog import must not archive completed products.
  v_archive_requested boolean := coalesce((p_payload->>'archive_existing')::boolean, false);
  v_archive_confirmed boolean := coalesce((p_payload->>'archive_existing_confirmed')::boolean, false);
  v_archive boolean := false;
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

  if v_archive_requested and not v_archive_confirmed then
    raise exception 'archive_existing_confirmation_required' using errcode = 'P0001';
  end if;
  v_archive := v_archive_requested and v_archive_confirmed;

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
    if v_cat is null
       or v_cat not in (
         'Human Hair',
         'List of Hair Products',
         'Extensions',
         'Ponytail Hair',
         'Makeup Products',
         'Lash Extension',
         'Hair & Salon Equipment',
         'Microblading'
       )
    then
      raise exception 'invalid_product_category'
        using errcode = 'P0001';
    end if;
    v_notes := nullif(trim(coalesce(v_row->>'notes', '')), '');

    v_item_type := coalesce(nullif(trim(v_row->>'item_type'), ''), 'retail');
    if v_item_type not in ('retail', 'asset') then
      v_item_type := 'retail';
    end if;
    if public.inventory_asset_name_match(v_pname) then
      v_item_type := 'asset';
    end if;

    -- Name + category only. Qty 0. Operational figures NULL until manual setup.
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
      null,
      null,
      null,
      null,
      'USD',
      null,
      'USD',
      null,
      null,
      null,
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
  'Catalog-only seed: required category + name, qty 0, operational cost/price/reorder NULL, setup_status=needs_setup. archive_existing defaults false; requires archive_existing_confirmed=true when archival is requested.';
