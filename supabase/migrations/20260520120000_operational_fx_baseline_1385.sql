-- Operational FX baseline: 1 USD = 1385 NGN (official). Centralize SQL fallbacks via helper functions.

-- ---------------------------------------------------------------------------
-- Central FX helpers (settings row → baseline 1385 / 190)
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

comment on function public.operational_ngn_per_usd() is
  'Operational NGN per 1 USD: operational_settings.ngn_per_usd when set, else 1385.';

comment on function public.operational_lrd_per_usd() is
  'Operational LRD per 1 USD: operational_settings.lrd_per_usd when set, else 190.';

grant execute on function public.operational_ngn_per_usd() to authenticated;
grant execute on function public.operational_lrd_per_usd() to authenticated;

-- Seed baseline when unset
update public.operational_settings
set ngn_per_usd = 1385
where id = 1
  and (ngn_per_usd is null or ngn_per_usd <= 0);

-- ---------------------------------------------------------------------------
-- FX snapshot for movement ledger
-- ---------------------------------------------------------------------------
create or replace function public.operational_fx_snapshot_row()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ngn_per_usd', public.operational_ngn_per_usd(),
    'lrd_per_usd', public.operational_lrd_per_usd()
  );
$$;

-- ---------------------------------------------------------------------------
-- Purchase / WAC conversion helpers
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Sales revenue USD equiv (NGN lines)
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
  select i.quantity_on_hand,
         coalesce(i.weighted_avg_landed_usd_cents, 0),
         i.avg_unit_cost_cents,
         coalesce(nullif(i.fx_ngn_per_usd, 0), public.operational_ngn_per_usd())
    into strict v_qty, v_wac_usd, v_avg_cost, v_fx_ngn
  from public.inventory_items i
  where i.id = new.inventory_item_id
  for update;

  if v_qty + 1e-9 < new.qty then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  if new.unit_cost_cents is null or new.unit_cost_cents = 0 then
    new.unit_cost_cents := v_avg_cost;
  end if;

  if new.revenue_usd_equiv_cents is null then
    if new.currency = 'USD' then
      v_rev_usd := round(new.qty * new.unit_price_cents);
    elsif new.currency = 'LRD' then
      v_rev_usd := round((new.qty * new.unit_price_cents)::numeric / public.operational_lrd_per_usd());
    elsif new.currency = 'NGN' then
      v_rev_usd := round((new.qty * new.unit_price_cents)::numeric / v_fx_ngn);
    else
      v_rev_usd := round(new.qty * new.unit_price_cents);
    end if;
    new.revenue_usd_equiv_cents := v_rev_usd;
  end if;

  if new.gross_profit_usd_cents is null then
    new.gross_profit_usd_cents := greatest(
      0,
      new.revenue_usd_equiv_cents - round(new.qty * v_wac_usd)
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inventory import commit fallback FX
-- ---------------------------------------------------------------------------
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
    raise exception 'forbidden' using errcode = '42501';
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
    jsonb_build_object('ngn_per_usd', v_fx_ngn, 'lrd_per_usd', v_fx_lrd),
    v_unresolved,
    v_unresolved,
    v_parent
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
      import_batch_id
    ) values (
      v_pname,
      v_pname,
      coalesce(nullif(trim(v_row->>'unit'), ''), 'each'),
      v_qty,
      5,
      5,
      5,
      v_retail,
      'NGN',
      v_retail,
      'NGN',
      v_fx_ngn,
      0,
      v_wac,
      nullif(v_sell_usd, 0),
      nullif(v_sell_lrd, 0),
      nullif(v_sell_usd, 0),
      v_cat,
      v_notes,
      true,
      v_batch_id
    );

    v_imported := v_imported + 1;
    if v_status = 'warning' then
      v_warnings := v_warnings + 1;
    end if;
  end loop;

  v_unresolved_count := jsonb_array_length(v_unresolved);

  update public.inventory_import_batches
  set
    status = 'completed',
    completed_at = now(),
    archived_count = v_archived,
    imported_count = v_imported,
    skipped_count = v_skipped,
    unresolved_count = v_unresolved_count,
    warning_count = v_warnings,
    error_count = v_errors,
    category_totals = v_cat_totals
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

comment on column public.inventory_items.fx_ngn_per_usd is
  'NGN per 1 USD (e.g. 1385 = ₦1385 buys $1). Used with NGN unit cost; falls back to operational baseline when null.';
