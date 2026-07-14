-- =============================================================================
-- Fix: production has no public.services / stylists / stylist_services.
-- operational_reset_preserved_counts() must not statically reference them
-- (to_regclass null → relation does not exist).
-- Forward-only. Does NOT auto-execute. Does not change wipe order.
-- =============================================================================

create or replace function public.operational_reset_preserved_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Real production config/auth only. Absent booking-catalog relations must not
  -- be referenced statically (preview/reset would fail with relation-does-not-exist).
  -- Transaction tables (service_logs, weekly_*, space_lease_payments) stay in wipe scope.
  return jsonb_build_object(
    'auth_users', (select count(*)::int from auth.users),
    'user_profiles', (select count(*)::int from public.user_profiles),
    'users', (select count(*)::int from public.users),
    'roles', (select count(*)::int from public.roles),
    'suppliers', (select count(*)::int from public.suppliers),
    'operational_settings', (select count(*)::int from public.operational_settings)
  );
end;
$$;

comment on function public.operational_reset_preserved_counts() is
  'Preserved auth/RBAC + suppliers + operational_settings only. Does not reference absent catalog relations.';

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
