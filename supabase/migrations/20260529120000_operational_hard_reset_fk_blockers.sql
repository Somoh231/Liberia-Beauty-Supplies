-- =============================================================================
-- Hard reset FK blockers: wipe legacy purchase_items + stock_movements before
-- inventory_items. Production still has these RESTRICT FKs; without deleting
-- them first, admin_reset_sales_and_inventory rolls back on inventory_items.
-- Does NOT auto-execute. Preserves users, RBAC, suppliers, service revenue,
-- leases, settings. No reset-history / audit / backup_reference persistence.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared wipe-scope counter (pre + post)
-- ---------------------------------------------------------------------------
create or replace function public.operational_reset_scope_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'sales_edit_log', (select count(*)::int from public.sales_edit_log),
    'inventory_movements', (select count(*)::int from public.inventory_movements),
    'stock_movements', case
      when to_regclass('public.stock_movements') is null then 0
      else (select count(*)::int from public.stock_movements)
    end,
    'inventory_correction_log', (select count(*)::int from public.inventory_correction_log),
    'sales', (select count(*)::int from public.sales),
    'purchase_lines', (select count(*)::int from public.purchase_lines),
    'purchase_items', case
      when to_regclass('public.purchase_items') is null then 0
      else (select count(*)::int from public.purchase_items)
    end,
    'purchases', (select count(*)::int from public.purchases),
    -- Legacy weekly retail product lines (not weekly_service_sales / weekly_sales_reports)
    'weekly_product_sales', (select count(*)::int from public.weekly_product_sales),
    'inventory_import_batches', (select count(*)::int from public.inventory_import_batches),
    'inventory_items', (select count(*)::int from public.inventory_items),
    'daily_cash_reconciliations', (select count(*)::int from public.daily_cash_reconciliations),
    'service_logs_with_product_usage', (
      select count(*)::int from public.service_logs
      where product_usage is not null
        and jsonb_typeof(product_usage) = 'array'
        and jsonb_array_length(product_usage) > 0
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pre-flight preview (owner only)
-- ---------------------------------------------------------------------------
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
    'wipe', public.operational_reset_scope_counts(),
    'preserved', public.operational_reset_preserved_counts(),
    'preserved_tables', jsonb_build_array(
      'auth.users',
      'user_profiles',
      'suppliers',
      'service_logs',
      'space_lease_payments',
      'operational_settings',
      'weekly_sales_reports',
      'weekly_service_sales',
      'RBAC',
      'UI/routes/marketing/booking'
    ),
    'fx', jsonb_build_object(
      'ngn_per_usd', public.operational_ngn_per_usd(),
      'lrd_per_usd', public.operational_lrd_per_usd()
    ),
    'delete_order', jsonb_build_array(
      'sales_edit_log',
      'inventory_movements',
      'stock_movements',
      'inventory_correction_log',
      'sales',
      'purchase_lines',
      'purchase_items',
      'purchases',
      'weekly_product_sales',
      'inventory_import_batches',
      'inventory_items',
      'daily_cash_reconciliations',
      'service_logs.product_usage_clear'
    )
  );
end;
$$;

revoke all on function public.admin_preview_operational_reset() from public;
grant execute on function public.admin_preview_operational_reset() to authenticated;

-- ---------------------------------------------------------------------------
-- Hard reset: single transaction, FK-safe delete order (incl. legacy tables)
-- Same jsonb return type as 20260526120000 — CREATE OR REPLACE is fine.
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_sales_and_inventory(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_confirm text := trim(coalesce(p_payload->>'confirmation', ''));
  v_backup_ok boolean := coalesce((p_payload->>'backup_confirmed')::boolean, false);
  v_reauth_id uuid := nullif(trim(coalesce(p_payload->>'reauth_challenge_id', '')), '')::uuid;
  v_force_fail boolean := coalesce((p_payload->>'force_fail_after_sales_edit_log')::boolean, false);
  -- Ephemeral correlation id for the response only — not stored in any table.
  v_reset_id uuid := gen_random_uuid();
  v_pre jsonb;
  v_post jsonb;
  v_preserved_before jsonb;
  v_preserved_after jsonb;
  v_reauth public.operational_reset_reauth_challenges%rowtype;
  v_wipe_nonzero boolean;
begin
  if v_uid is null or not public.is_salon_owner() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if v_confirm is distinct from 'RESET SALES AND INVENTORY' then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;

  -- backup_confirmed is a boolean gate only: owner affirms an external snapshot
  -- was taken manually. Do not persist backup_reference, reason, or reset history.
  if not v_backup_ok then
    raise exception 'backup_confirmation_required' using errcode = 'P0001';
  end if;

  if v_reauth_id is null then
    raise exception 'reauth_required' using errcode = 'P0001';
  end if;

  select * into v_reauth
  from public.operational_reset_reauth_challenges
  where id = v_reauth_id
  for update;

  if not found then
    raise exception 'reauth_required' using errcode = 'P0001';
  end if;
  if v_reauth.owner_id is distinct from v_uid then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_reauth.consumed_at is not null then
    raise exception 'reauth_expired' using errcode = 'P0001';
  end if;
  if v_reauth.expires_at <= now() then
    raise exception 'reauth_expired' using errcode = 'P0001';
  end if;

  -- Consume challenge immediately (same txn — rollback restores if later fail)
  update public.operational_reset_reauth_challenges
  set consumed_at = now()
  where id = v_reauth_id;

  v_pre := public.operational_reset_scope_counts();
  v_preserved_before := public.operational_reset_preserved_counts();

  -- Intentionally does NOT write to operational_dataset_reset_log.

  -- 1
  delete from public.sales_edit_log;

  if v_force_fail then
    raise exception 'forced_test_failure' using errcode = 'P0001';
  end if;

  -- 2
  delete from public.inventory_movements;

  -- 3 legacy stock ledger (RESTRICT → inventory_items) — skip if table absent
  if to_regclass('public.stock_movements') is not null then
    delete from public.stock_movements;
  end if;

  -- 4
  delete from public.inventory_correction_log;

  -- 5
  delete from public.sales;

  -- 6
  delete from public.purchase_lines;

  -- 7 legacy purchase line items (RESTRICT → inventory_items) — skip if absent
  if to_regclass('public.purchase_items') is not null then
    delete from public.purchase_items;
  end if;

  -- 8
  delete from public.purchases;

  -- 9 legacy weekly product-sale rows (actual table: weekly_product_sales)
  delete from public.weekly_product_sales;

  -- 10 (import_batch_id on items is ON DELETE SET NULL)
  delete from public.inventory_import_batches;

  -- 11
  delete from public.inventory_items;

  -- 12 hard-delete reconciliations (owner decision: complete wipe)
  delete from public.daily_cash_reconciliations;

  -- 13 clear service product_usage; keep service rows + revenue
  update public.service_logs
  set product_usage = '[]'::jsonb
  where product_usage is not null
    and jsonb_typeof(product_usage) = 'array'
    and jsonb_array_length(product_usage) > 0;

  v_post := public.operational_reset_scope_counts();
  v_preserved_after := public.operational_reset_preserved_counts();

  v_wipe_nonzero :=
       coalesce((v_post->>'sales_edit_log')::int, 0) <> 0
    or coalesce((v_post->>'inventory_movements')::int, 0) <> 0
    or coalesce((v_post->>'stock_movements')::int, 0) <> 0
    or coalesce((v_post->>'inventory_correction_log')::int, 0) <> 0
    or coalesce((v_post->>'sales')::int, 0) <> 0
    or coalesce((v_post->>'purchase_lines')::int, 0) <> 0
    or coalesce((v_post->>'purchase_items')::int, 0) <> 0
    or coalesce((v_post->>'purchases')::int, 0) <> 0
    or coalesce((v_post->>'weekly_product_sales')::int, 0) <> 0
    or coalesce((v_post->>'inventory_import_batches')::int, 0) <> 0
    or coalesce((v_post->>'inventory_items')::int, 0) <> 0
    or coalesce((v_post->>'daily_cash_reconciliations')::int, 0) <> 0
    or coalesce((v_post->>'service_logs_with_product_usage')::int, 0) <> 0;

  if v_wipe_nonzero then
    raise exception 'reset_incomplete' using errcode = 'P0001';
  end if;

  if v_preserved_before is distinct from v_preserved_after then
    raise exception 'preserved_data_changed' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'reset_id', v_reset_id,
    'pre', v_pre,
    'post', v_post,
    'preserved', v_preserved_after
  );
end;
$$;

comment on function public.admin_reset_sales_and_inventory(jsonb) is
  'Owner-only hard wipe of sales/inventory operational data. Deletes stock_movements and purchase_items before inventory_items (RESTRICT FKs). Requires phrase, backup_confirmed boolean gate, and valid reauth challenge. No reset-history/audit row, backup_reference, or reason persistence. Hard-deletes daily_cash_reconciliations. Does not wipe users, RBAC, suppliers, service revenue, leases, or settings.';

revoke all on function public.admin_reset_sales_and_inventory(jsonb) from public;
grant execute on function public.admin_reset_sales_and_inventory(jsonb) to authenticated;
