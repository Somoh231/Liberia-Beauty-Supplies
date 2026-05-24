-- Inventory workbook import batches + transactional commit RPC (Phase 3).
-- Archives existing live inventory (soft), inserts validated rows, preserves unresolved rows for later import.

-- ---------------------------------------------------------------------------
-- Batch audit log
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  imported_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'failed')),
  archived_count int not null default 0,
  imported_count int not null default 0,
  skipped_count int not null default 0,
  unresolved_count int not null default 0,
  warning_count int not null default 0,
  error_count int not null default 0,
  category_totals jsonb not null default '{}'::jsonb,
  unresolved_rows jsonb not null default '[]'::jsonb,
  skipped_review_required jsonb not null default '[]'::jsonb,
  fx_snapshot jsonb,
  parent_batch_id uuid references public.inventory_import_batches (id) on delete set null,
  error_message text
);

create index if not exists inventory_import_batches_created_idx
  on public.inventory_import_batches (created_at desc);

comment on table public.inventory_import_batches is
  'Audit trail for workbook inventory imports. Unresolved rows preserved for later partial import.';

alter table public.inventory_import_batches enable row level security;

drop policy if exists "inventory_import_batches_select_admin" on public.inventory_import_batches;
create policy "inventory_import_batches_select_admin"
  on public.inventory_import_batches for select
  to authenticated
  using (public.is_salon_portal_admin());

-- Inserts/updates via security definer RPC only
drop policy if exists "inventory_import_batches_insert_admin" on public.inventory_import_batches;
create policy "inventory_import_batches_insert_admin"
  on public.inventory_import_batches for insert
  to authenticated
  with check (public.is_salon_portal_admin());

drop policy if exists "inventory_import_batches_update_admin" on public.inventory_import_batches;
create policy "inventory_import_batches_update_admin"
  on public.inventory_import_batches for update
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

-- Lineage on imported items
alter table public.inventory_items
  add column if not exists import_batch_id uuid references public.inventory_import_batches (id) on delete set null;

create index if not exists inventory_items_import_batch_idx
  on public.inventory_items (import_batch_id)
  where import_batch_id is not null;

comment on column public.inventory_items.import_batch_id is
  'Workbook import batch that created this row (Phase 3 migration).';

-- ---------------------------------------------------------------------------
-- Transactional commit: archive live inventory + insert validated rows
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
  v_fx_ngn numeric := coalesce((p_payload->>'fx_ngn_per_usd')::numeric, 1550);
  v_fx_lrd numeric := coalesce((p_payload->>'fx_lrd_per_usd')::numeric, 190);
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

comment on function public.commit_inventory_workbook_import(jsonb) is
  'Phase 3: archive live inventory (optional), insert validated import rows, log batch. Atomic — rolls back on any error.';

revoke all on function public.commit_inventory_workbook_import(jsonb) from public;
grant execute on function public.commit_inventory_workbook_import(jsonb) to authenticated;
