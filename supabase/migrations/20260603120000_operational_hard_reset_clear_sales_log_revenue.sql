-- =============================================================================
-- Expand hard reset: wipe ALL Sales Log revenue sources (complete clean restart).
-- Deletes service transaction logs and space/rental payment history while
-- preserving service catalog, stylists, users, suppliers, FX/settings.
-- Forward-only. Does NOT auto-execute. Every DELETE uses WHERE true.
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
    'stock_movements', public.safe_table_count('public.stock_movements'),
    'inventory_correction_log', (select count(*)::int from public.inventory_correction_log),
    'sale_items', public.safe_table_count('public.sale_items'),
    'sales', (select count(*)::int from public.sales),
    'purchase_lines', (select count(*)::int from public.purchase_lines),
    'purchase_items', public.safe_table_count('public.purchase_items'),
    'purchase_invoices', public.safe_table_count('public.purchase_invoices'),
    'purchases', (select count(*)::int from public.purchases),
    'weekly_product_sales', (select count(*)::int from public.weekly_product_sales),
    'weekly_service_sales', (select count(*)::int from public.weekly_service_sales),
    'weekly_stylist_space_payments', (select count(*)::int from public.weekly_stylist_space_payments),
    'weekly_sales_reports', (select count(*)::int from public.weekly_sales_reports),
    'weekly_log_product_lines', public.safe_table_count('public.weekly_log_product_lines'),
    'weekly_log_service_lines', public.safe_table_count('public.weekly_log_service_lines'),
    'weekly_logs', public.safe_table_count('public.weekly_logs'),
    'inventory_import_batches', (select count(*)::int from public.inventory_import_batches),
    'inventory_items', (select count(*)::int from public.inventory_items),
    'daily_cash_reconciliations', (select count(*)::int from public.daily_cash_reconciliations),
    'service_logs', (select count(*)::int from public.service_logs),
    'space_lease_payments', (select count(*)::int from public.space_lease_payments),
    -- Retained for UI compatibility; always 0 after full service_logs wipe.
    'service_logs_with_product_usage', (
      select count(*)::int from public.service_logs
      where product_usage is not null
        and jsonb_typeof(product_usage) = 'array'
        and jsonb_array_length(product_usage) > 0
    )
  );
end;
$$;

comment on function public.operational_reset_scope_counts() is
  'Pre/post wipe counters for hard reset, including Sales Log service + rental transaction sources.';

create or replace function public.operational_reset_preserved_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Auth/RBAC model (no separate permissions table):
  --   auth.users          — authentication identities
  --   public.user_profiles — canonical portal role assignment (owner/manager/staff)
  --   public.users         — legacy 1:1 auth mirror with role_id
  --   public.roles         — application role catalog (slug definitions)
  return jsonb_build_object(
    'auth_users', (select count(*)::int from auth.users),
    'user_profiles', (select count(*)::int from public.user_profiles),
    'users', (select count(*)::int from public.users),
    'roles', (select count(*)::int from public.roles),
    'suppliers', (select count(*)::int from public.suppliers),
    'operational_settings', (select count(*)::int from public.operational_settings),
    'services', (select count(*)::int from public.services),
    'stylists', (select count(*)::int from public.stylists),
    'stylist_services', (select count(*)::int from public.stylist_services)
  );
end;
$$;

comment on function public.operational_reset_preserved_counts() is
  'Master/config + auth/RBAC rows that must remain unchanged across hard reset (auth.users, user_profiles, users, roles, suppliers, catalog, settings).';

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
      'users',
      'roles',
      'suppliers',
      'services',
      'stylists',
      'stylist_services',
      'operational_settings',
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
      'weekly_service_sales',
      'weekly_stylist_space_payments',
      'weekly_sales_reports',
      'weekly_log_product_lines',
      'weekly_log_service_lines',
      'weekly_logs',
      'inventory_import_batches',
      'inventory_items',
      'daily_cash_reconciliations',
      'service_logs',
      'space_lease_payments'
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

  begin
    -- 1 required
    delete from public.sales_edit_log where true;

    if v_force_fail then
      raise exception 'forced_test_failure' using errcode = 'P0001';
    end if;

    -- 2 required
    delete from public.inventory_movements where true;

    -- 3 optional legacy (dynamic — no static relation reference)
    perform public.safe_delete_table_if_exists('public.stock_movements');

    -- 4 required
    delete from public.inventory_correction_log where true;

    -- 5 optional legacy
    perform public.safe_delete_table_if_exists('public.sale_items');

    -- 6 required
    delete from public.sales where true;

    -- 7 required
    delete from public.purchase_lines where true;

    -- 8–9 optional legacy
    perform public.safe_delete_table_if_exists('public.purchase_items');
    perform public.safe_delete_table_if_exists('public.purchase_invoices');

    -- 10 required
    delete from public.purchases where true;

    -- 11–14 required weekly Sales Log worksheets (children before parent)
    delete from public.weekly_product_sales where true;
    delete from public.weekly_service_sales where true;
    delete from public.weekly_stylist_space_payments where true;
    delete from public.weekly_sales_reports where true;

    -- 15–17 optional legacy weekly log tables
    perform public.safe_delete_table_if_exists('public.weekly_log_product_lines');
    perform public.safe_delete_table_if_exists('public.weekly_log_service_lines');
    perform public.safe_delete_table_if_exists('public.weekly_logs');

    -- 18–20 required inventory + reconciliations
    delete from public.inventory_import_batches where true;
    delete from public.inventory_items where true;
    delete from public.daily_cash_reconciliations where true;

    -- 21–22 Sales Log live service + rental transaction history (not catalog/config)
    delete from public.service_logs where true;
    delete from public.space_lease_payments where true;
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
    or coalesce((v_post->>'weekly_service_sales')::int, 0) <> 0
    or coalesce((v_post->>'weekly_stylist_space_payments')::int, 0) <> 0
    or coalesce((v_post->>'weekly_sales_reports')::int, 0) <> 0
    or coalesce((v_post->>'weekly_log_product_lines')::int, 0) <> 0
    or coalesce((v_post->>'weekly_log_service_lines')::int, 0) <> 0
    or coalesce((v_post->>'weekly_logs')::int, 0) <> 0
    or coalesce((v_post->>'inventory_import_batches')::int, 0) <> 0
    or coalesce((v_post->>'inventory_items')::int, 0) <> 0
    or coalesce((v_post->>'daily_cash_reconciliations')::int, 0) <> 0
    or coalesce((v_post->>'service_logs')::int, 0) <> 0
    or coalesce((v_post->>'space_lease_payments')::int, 0) <> 0
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
  'Owner-only hard wipe of retail, inventory, service logs, and rental payment history. Preserves users, suppliers, service catalog, stylists, FX/settings. All DELETEs use WHERE true.';

revoke all on function public.admin_reset_sales_and_inventory(jsonb) from public;
grant execute on function public.admin_reset_sales_and_inventory(jsonb) to authenticated;
