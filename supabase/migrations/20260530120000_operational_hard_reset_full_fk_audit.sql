-- =============================================================================
-- Hard reset: expand FK wipe scope + surface actionable failure details.
-- Legacy production tables (sale_items, purchase_invoices, weekly_logs*, etc.)
-- may still RESTRICT inventory/sales deletes even after purchase_items /
-- stock_movements were added. Uses to_regclass for optional legacy tables.
-- Does NOT auto-execute. No reset audit/history write.
-- =============================================================================

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
    'sale_items', case
      when to_regclass('public.sale_items') is null then 0
      else (select count(*)::int from public.sale_items)
    end,
    'sales', (select count(*)::int from public.sales),
    'purchase_lines', (select count(*)::int from public.purchase_lines),
    'purchase_items', case
      when to_regclass('public.purchase_items') is null then 0
      else (select count(*)::int from public.purchase_items)
    end,
    'purchase_invoices', case
      when to_regclass('public.purchase_invoices') is null then 0
      else (select count(*)::int from public.purchase_invoices)
    end,
    'purchases', (select count(*)::int from public.purchases),
    'weekly_product_sales', (select count(*)::int from public.weekly_product_sales),
    'weekly_log_product_lines', case
      when to_regclass('public.weekly_log_product_lines') is null then 0
      else (select count(*)::int from public.weekly_log_product_lines)
    end,
    'weekly_log_service_lines', case
      when to_regclass('public.weekly_log_service_lines') is null then 0
      else (select count(*)::int from public.weekly_log_service_lines)
    end,
    'weekly_logs', case
      when to_regclass('public.weekly_logs') is null then 0
      else (select count(*)::int from public.weekly_logs)
    end,
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
      'sale_items',
      'sales',
      'purchase_lines',
      'purchase_items',
      'purchase_invoices',
      'purchases',
      'weekly_product_sales',
      'weekly_log_product_lines',
      'weekly_log_service_lines',
      'weekly_logs',
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

create or replace function public.admin_reset_sales_and_inventory(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_confirm text := trim(coalesce(p_payload->>'confirmation', ''));
  v_backup_ok boolean := coalesce((p_payload->>'backup_confirmed')::boolean, false);
  v_reauth_id uuid := nullif(trim(coalesce(p_payload->>'reauth_challenge_id', '')), '')::uuid;
  v_force_fail boolean := coalesce((p_payload->>'force_fail_after_sales_edit_log')::boolean, false);
  v_reset_id uuid := gen_random_uuid();
  v_pre jsonb;
  v_post jsonb;
  v_preserved_before jsonb;
  v_preserved_after jsonb;
  v_reauth public.operational_reset_reauth_challenges%rowtype;
  v_wipe_nonzero boolean;
  v_nonzero_keys text;
begin
  if v_uid is null or not public.is_salon_owner() then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if v_confirm is distinct from 'RESET SALES AND INVENTORY' then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;

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

  update public.operational_reset_reauth_challenges
  set consumed_at = now()
  where id = v_reauth_id;

  v_pre := public.operational_reset_scope_counts();
  v_preserved_before := public.operational_reset_preserved_counts();

  -- Intentionally does NOT write to operational_dataset_reset_log.

  begin
    -- 1
    delete from public.sales_edit_log;

    if v_force_fail then
      raise exception 'forced_test_failure' using errcode = 'P0001';
    end if;

    -- 2
    delete from public.inventory_movements;

    -- 3 legacy stock ledger (RESTRICT → inventory_items)
    if to_regclass('public.stock_movements') is not null then
      delete from public.stock_movements;
    end if;

    -- 4
    delete from public.inventory_correction_log;

    -- 5 legacy POS lines (before / with sales)
    if to_regclass('public.sale_items') is not null then
      delete from public.sale_items;
    end if;

    -- 6 (RESTRICT → inventory_items)
    delete from public.sales;

    -- 7
    delete from public.purchase_lines;

    -- 8 legacy purchase invoice lines (RESTRICT → inventory_items)
    if to_regclass('public.purchase_items') is not null then
      delete from public.purchase_items;
    end if;

    -- 9 legacy purchase invoice headers
    if to_regclass('public.purchase_invoices') is not null then
      delete from public.purchase_invoices;
    end if;

    -- 10
    delete from public.purchases;

    -- 11 (RESTRICT → inventory_items)
    delete from public.weekly_product_sales;

    -- 12–14 legacy weekly log tables (product lines may SET NULL; wipe anyway)
    if to_regclass('public.weekly_log_product_lines') is not null then
      delete from public.weekly_log_product_lines;
    end if;
    if to_regclass('public.weekly_log_service_lines') is not null then
      delete from public.weekly_log_service_lines;
    end if;
    if to_regclass('public.weekly_logs') is not null then
      delete from public.weekly_logs;
    end if;

    -- 15
    delete from public.inventory_import_batches;

    -- 16
    delete from public.inventory_items;

    -- 17
    delete from public.daily_cash_reconciliations;

    -- 18 clear service product_usage; keep service rows + revenue
    update public.service_logs
    set product_usage = '[]'::jsonb
    where product_usage is not null
      and jsonb_typeof(product_usage) = 'array'
      and jsonb_array_length(product_usage) > 0;
  exception
    when foreign_key_violation then
      raise exception 'foreign_key_violation %', SQLERRM using errcode = 'P0001';
    when others then
      if SQLERRM like 'confirmation_mismatch%'
         or SQLERRM like 'backup_confirmation_required%'
         or SQLERRM like 'reauth_%'
         or SQLERRM like 'unauthorized%'
         or SQLERRM like 'forced_test_failure%'
         or SQLERRM like 'reset_incomplete%'
         or SQLERRM like 'preserved_data_changed%'
         or SQLERRM like 'foreign_key_violation%' then
        raise;
      end if;
      raise exception 'reset_failed: % (sqlstate %)', SQLERRM, SQLSTATE using errcode = 'P0001';
  end;

  v_post := public.operational_reset_scope_counts();
  v_preserved_after := public.operational_reset_preserved_counts();

  v_wipe_nonzero :=
       coalesce((v_post->>'sales_edit_log')::int, 0) <> 0
    or coalesce((v_post->>'inventory_movements')::int, 0) <> 0
    or coalesce((v_post->>'stock_movements')::int, 0) <> 0
    or coalesce((v_post->>'inventory_correction_log')::int, 0) <> 0
    or coalesce((v_post->>'sale_items')::int, 0) <> 0
    or coalesce((v_post->>'sales')::int, 0) <> 0
    or coalesce((v_post->>'purchase_lines')::int, 0) <> 0
    or coalesce((v_post->>'purchase_items')::int, 0) <> 0
    or coalesce((v_post->>'purchase_invoices')::int, 0) <> 0
    or coalesce((v_post->>'purchases')::int, 0) <> 0
    or coalesce((v_post->>'weekly_product_sales')::int, 0) <> 0
    or coalesce((v_post->>'weekly_log_product_lines')::int, 0) <> 0
    or coalesce((v_post->>'weekly_log_service_lines')::int, 0) <> 0
    or coalesce((v_post->>'weekly_logs')::int, 0) <> 0
    or coalesce((v_post->>'inventory_import_batches')::int, 0) <> 0
    or coalesce((v_post->>'inventory_items')::int, 0) <> 0
    or coalesce((v_post->>'daily_cash_reconciliations')::int, 0) <> 0
    or coalesce((v_post->>'service_logs_with_product_usage')::int, 0) <> 0;

  if v_wipe_nonzero then
    select string_agg(key, ', ' order by key)
      into v_nonzero_keys
    from jsonb_each_text(v_post)
    where value ~ '^[0-9]+$'
      and value::int <> 0;

    raise exception 'reset_incomplete: %', coalesce(v_nonzero_keys, v_post::text)
      using errcode = 'P0001';
  end if;

  if v_preserved_before is distinct from v_preserved_after then
    raise exception 'preserved_data_changed: before=% after=%',
      v_preserved_before, v_preserved_after using errcode = 'P0001';
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
  'Owner-only hard wipe of sales/inventory operational data including legacy sale_items/purchase_invoices/stock_movements/purchase_items/weekly_logs. row_security off. Raises foreign_key_violation / reset_incomplete / preserved_data_changed with detail. No audit row.';

revoke all on function public.admin_reset_sales_and_inventory(jsonb) from public;
grant execute on function public.admin_reset_sales_and_inventory(jsonb) to authenticated;
