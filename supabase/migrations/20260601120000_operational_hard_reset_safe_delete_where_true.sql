-- =============================================================================
-- Emergency fix: production blocks unrestricted DELETE (sqlstate 21000).
-- Every destructive DELETE must include WHERE true. Prefer DELETE over TRUNCATE
-- to keep FK-aware transactional wipe behavior. Optional legacy tables still
-- use dynamic SQL via to_regclass. Does NOT auto-execute. No audit write.
-- =============================================================================

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
  -- WHERE true satisfies environments that reject unrestricted DELETE.
  execute format('delete from %s where true', v_rel);
end;
$$;

comment on function public.safe_delete_table_if_exists(text) is
  'No-op when relation is absent; otherwise DELETE FROM ... WHERE true via dynamic SQL on to_regclass result.';

revoke all on function public.safe_delete_table_if_exists(text) from public;

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

    -- 11 required
    delete from public.weekly_product_sales where true;

    -- 12–14 optional legacy weekly log tables
    perform public.safe_delete_table_if_exists('public.weekly_log_product_lines');
    perform public.safe_delete_table_if_exists('public.weekly_log_service_lines');
    perform public.safe_delete_table_if_exists('public.weekly_logs');

    -- 15–17 required
    delete from public.inventory_import_batches where true;
    delete from public.inventory_items where true;
    delete from public.daily_cash_reconciliations where true;

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
  'Owner-only hard wipe. All DELETEs use WHERE true (production sqlstate 21000 guard). Optional legacy tables via safe_delete_table_if_exists. No TRUNCATE. No audit row.';

revoke all on function public.admin_reset_sales_and_inventory(jsonb) from public;
grant execute on function public.admin_reset_sales_and_inventory(jsonb) to authenticated;
