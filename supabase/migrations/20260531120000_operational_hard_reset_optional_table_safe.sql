-- =============================================================================
-- Emergency fix: optional legacy tables must use dynamic SQL.
-- Static CASE/IF references to public.sale_items (etc.) still fail parse/plan
-- when the relation does not exist. Count/delete via to_regclass + EXECUTE.
-- Does NOT auto-execute reset. No audit/history write.
-- =============================================================================

create or replace function public.safe_table_count(p_regclass text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rel regclass;
  v_count integer;
begin
  v_rel := to_regclass(p_regclass);
  if v_rel is null then
    return 0;
  end if;
  -- %s with regclass is injection-safe: only an existing OID is formatted.
  execute format('select count(*)::int from %s', v_rel) into v_count;
  return coalesce(v_count, 0);
end;
$$;

comment on function public.safe_table_count(text) is
  'Returns 0 when relation is absent; otherwise COUNT(*) via dynamic SQL on to_regclass result.';

revoke all on function public.safe_table_count(text) from public;
grant execute on function public.safe_table_count(text) to authenticated;

create or replace function public.safe_delete_table_if_exists(p_regclass text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_rel regclass;
begin
  v_rel := to_regclass(p_regclass);
  if v_rel is null then
    return;
  end if;
  execute format('delete from %s', v_rel);
end;
$$;

comment on function public.safe_delete_table_if_exists(text) is
  'No-op when relation is absent; otherwise DELETE FROM via dynamic SQL on to_regclass result.';

revoke all on function public.safe_delete_table_if_exists(text) from public;
-- Internal reset helper; not granted to authenticated (only called from SECURITY DEFINER reset).

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
    'stock_movements', public.safe_table_count('public.stock_movements'),
    'inventory_correction_log', (select count(*)::int from public.inventory_correction_log),
    'sale_items', public.safe_table_count('public.sale_items'),
    'sales', (select count(*)::int from public.sales),
    'purchase_lines', (select count(*)::int from public.purchase_lines),
    'purchase_items', public.safe_table_count('public.purchase_items'),
    'purchase_invoices', public.safe_table_count('public.purchase_invoices'),
    'purchases', (select count(*)::int from public.purchases),
    'weekly_product_sales', (select count(*)::int from public.weekly_product_sales),
    'weekly_log_product_lines', public.safe_table_count('public.weekly_log_product_lines'),
    'weekly_log_service_lines', public.safe_table_count('public.weekly_log_service_lines'),
    'weekly_logs', public.safe_table_count('public.weekly_logs'),
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
    -- 1 required
    delete from public.sales_edit_log;

    if v_force_fail then
      raise exception 'forced_test_failure' using errcode = 'P0001';
    end if;

    -- 2 required
    delete from public.inventory_movements;

    -- 3 optional legacy (dynamic — no static relation reference)
    perform public.safe_delete_table_if_exists('public.stock_movements');

    -- 4 required
    delete from public.inventory_correction_log;

    -- 5 optional legacy
    perform public.safe_delete_table_if_exists('public.sale_items');

    -- 6 required
    delete from public.sales;

    -- 7 required
    delete from public.purchase_lines;

    -- 8–9 optional legacy
    perform public.safe_delete_table_if_exists('public.purchase_items');
    perform public.safe_delete_table_if_exists('public.purchase_invoices');

    -- 10 required
    delete from public.purchases;

    -- 11 required
    delete from public.weekly_product_sales;

    -- 12–14 optional legacy weekly log tables
    perform public.safe_delete_table_if_exists('public.weekly_log_product_lines');
    perform public.safe_delete_table_if_exists('public.weekly_log_service_lines');
    perform public.safe_delete_table_if_exists('public.weekly_logs');

    -- 15–17 required
    delete from public.inventory_import_batches;
    delete from public.inventory_items;
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
  'Owner-only hard wipe. Optional legacy tables counted/deleted only via safe_table_count / safe_delete_table_if_exists (dynamic SQL). No static references to absent relations. No audit row.';

revoke all on function public.admin_reset_sales_and_inventory(jsonb) from public;
grant execute on function public.admin_reset_sales_and_inventory(jsonb) to authenticated;
