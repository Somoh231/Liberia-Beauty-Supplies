-- =============================================================================
-- Chunk 1: editable service_logs (manager/owner).
-- Transactional update with inventory restore/deduct for product_usage.
-- Forward-only. Does NOT auto-execute. Does not touch weekly_* summaries.
-- =============================================================================

alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;

alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (
    movement_type in (
      'purchase', 'retail_sale', 'service_usage', 'manual_adjustment', 'correction',
      'damaged', 'expired', 'restock', 'opening_balance', 'initial', 'other',
      'sale_edit_restore', 'sale_edit_deduct',
      'service_edit_restore', 'service_edit_deduct',
      'catalog_reset'
    )
  );

create table if not exists public.service_logs_edit_log (
  id uuid primary key default gen_random_uuid(),
  service_log_id uuid not null references public.service_logs (id) on delete cascade,
  edited_by uuid references auth.users (id) on delete set null,
  edit_reason text not null,
  before_values jsonb not null,
  after_values jsonb not null,
  created_at timestamptz not null default now(),
  constraint service_logs_edit_log_reason_len check (char_length(trim(edit_reason)) >= 3)
);

create index if not exists service_logs_edit_log_service_idx
  on public.service_logs_edit_log (service_log_id, created_at desc);

comment on table public.service_logs_edit_log is
  'Immutable before/after audit for manager/owner service_log corrections.';

alter table public.service_logs_edit_log enable row level security;

drop policy if exists "service_logs_edit_log_select_admin" on public.service_logs_edit_log;
create policy "service_logs_edit_log_select_admin"
  on public.service_logs_edit_log for select
  using (public.is_salon_portal_admin());

-- No direct client inserts — SECURITY DEFINER RPC only.
revoke all on table public.service_logs_edit_log from public;
grant select on table public.service_logs_edit_log to authenticated;

create or replace function public.admin_edit_service_log(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(trim(p_payload->>'service_log_id'), '')::uuid;
  v_reason text := trim(coalesce(p_payload->>'edit_reason', ''));
  v_old public.service_logs%rowtype;
  v_new_name text;
  v_new_category text;
  v_new_revenue bigint;
  v_new_currency text;
  v_new_sold_at timestamptz;
  v_new_staff text;
  v_new_note text;
  v_new_customer text;
  v_new_phone text;
  v_new_facebook text;
  v_new_usage jsonb;
  v_old_usage jsonb;
  v_rev_usd bigint;
  v_fx_ngn numeric;
  v_day text;
  v_el jsonb;
  v_iid uuid;
  v_qty numeric(14, 4);
  v_log_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not public.is_salon_portal_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'invalid_service_log_id' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 then
    raise exception 'edit_reason_required' using errcode = 'P0001';
  end if;

  select * into v_old
  from public.service_logs
  where id = v_id
  for update;

  if not found then
    raise exception 'service_log_not_found' using errcode = 'P0001';
  end if;

  v_new_name := coalesce(nullif(trim(p_payload->>'service_name'), ''), v_old.service_name);
  if length(v_new_name) < 2 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;

  v_new_category := case
    when p_payload ? 'service_category' then nullif(trim(p_payload->>'service_category'), '')
    else v_old.service_category
  end;

  v_new_revenue := coalesce((p_payload->>'revenue_cents')::bigint, v_old.revenue_cents);
  if v_new_revenue is null or v_new_revenue < 0 then
    raise exception 'invalid_revenue' using errcode = 'P0001';
  end if;

  v_new_currency := coalesce(nullif(trim(p_payload->>'currency'), ''), v_old.currency);
  if v_new_currency not in ('USD', 'LRD', 'NGN') then
    raise exception 'invalid_currency' using errcode = 'P0001';
  end if;

  -- service_date: absent → preserve; present but blank/invalid → hard fail; valid calendar YMD → update
  if not (p_payload ? 'service_date') then
    v_new_sold_at := v_old.sold_at;
  else
    v_day := nullif(trim(coalesce(p_payload->>'service_date', '')), '');
    if v_day is null or v_day !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'invalid_service_date' using errcode = 'P0001';
    end if;
    begin
      -- Reject non-calendar dates (e.g. 2026-02-30) via round-trip; Postgres date casts can overflow.
      if to_char(v_day::date, 'YYYY-MM-DD') is distinct from v_day then
        raise exception 'invalid_service_date' using errcode = 'P0001';
      end if;
    exception
      when others then
        raise exception 'invalid_service_date' using errcode = 'P0001';
    end;
    v_new_sold_at := (v_day || 'T12:00:00.000Z')::timestamptz;
  end if;

  v_new_staff := case
    when p_payload ? 'staff_name' then nullif(trim(p_payload->>'staff_name'), '')
    else v_old.staff_name
  end;
  v_new_note := case
    when p_payload ? 'client_note' then nullif(trim(p_payload->>'client_note'), '')
    else v_old.client_note
  end;
  v_new_customer := case
    when p_payload ? 'customer_name' then nullif(trim(p_payload->>'customer_name'), '')
    else v_old.customer_name
  end;
  v_new_phone := case
    when p_payload ? 'customer_phone' then nullif(trim(p_payload->>'customer_phone'), '')
    else v_old.customer_phone
  end;
  v_new_facebook := case
    when p_payload ? 'customer_facebook' then nullif(trim(p_payload->>'customer_facebook'), '')
    else v_old.customer_facebook
  end;

  if p_payload ? 'product_usage' then
    v_new_usage := coalesce(p_payload->'product_usage', '[]'::jsonb);
  else
    v_new_usage := coalesce(v_old.product_usage, '[]'::jsonb);
  end if;
  if jsonb_typeof(v_new_usage) is distinct from 'array' then
    raise exception 'invalid_product_usage' using errcode = 'P0001';
  end if;

  v_old_usage := coalesce(v_old.product_usage, '[]'::jsonb);

  v_before := jsonb_build_object(
    'service_name', v_old.service_name,
    'service_category', v_old.service_category,
    'revenue_cents', v_old.revenue_cents,
    'currency', v_old.currency,
    'sold_at', v_old.sold_at,
    'staff_name', v_old.staff_name,
    'client_note', v_old.client_note,
    'customer_name', v_old.customer_name,
    'customer_phone', v_old.customer_phone,
    'customer_facebook', v_old.customer_facebook,
    'product_usage', v_old_usage,
    'revenue_usd_equiv_cents', v_old.revenue_usd_equiv_cents
  );

  -- Restore inventory from previous product usage
  if jsonb_typeof(v_old_usage) = 'array' then
    for v_el in select value from jsonb_array_elements(v_old_usage) as t(value)
    loop
      begin
        v_iid := (v_el->>'inventory_item_id')::uuid;
        v_qty := (v_el->>'qty')::numeric(14, 4);
      exception when others then
        raise exception 'invalid_product_usage' using errcode = 'P0001';
      end;
      if v_iid is null or v_qty is null or v_qty <= 0 then
        raise exception 'invalid_product_usage' using errcode = 'P0001';
      end if;
      perform public.apply_inventory_qty_delta(
        v_iid,
        v_qty,
        'service_edit_restore',
        'service_log',
        v_id,
        format('Service edit restore (%s)', v_reason)
      );
    end loop;
  end if;

  -- Deduct inventory for new product usage
  for v_el in select value from jsonb_array_elements(v_new_usage) as t(value)
  loop
    begin
      v_iid := (v_el->>'inventory_item_id')::uuid;
      v_qty := (v_el->>'qty')::numeric(14, 4);
    exception when others then
      raise exception 'invalid_product_usage' using errcode = 'P0001';
    end;
    if v_iid is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid_product_usage' using errcode = 'P0001';
    end if;
    perform public.apply_inventory_qty_delta(
      v_iid,
      -v_qty,
      'service_edit_deduct',
      'service_log',
      v_id,
      format('Service edit deduct (%s)', v_reason)
    );
  end loop;

  v_fx_ngn := public.operational_ngn_per_usd();
  if v_new_currency = 'USD' then
    v_rev_usd := v_new_revenue;
  elsif v_new_currency = 'LRD' then
    v_rev_usd := round(v_new_revenue::numeric / public.operational_lrd_per_usd());
  elsif v_new_currency = 'NGN' then
    v_rev_usd := round(v_new_revenue::numeric / v_fx_ngn);
  else
    v_rev_usd := v_new_revenue;
  end if;

  -- Update existing row only — preserve id, created_at, created_by
  update public.service_logs
  set
    service_name = v_new_name,
    service_category = v_new_category,
    revenue_cents = v_new_revenue,
    currency = v_new_currency,
    sold_at = v_new_sold_at,
    staff_name = v_new_staff,
    client_note = v_new_note,
    customer_name = v_new_customer,
    customer_phone = v_new_phone,
    customer_facebook = v_new_facebook,
    product_usage = v_new_usage,
    revenue_usd_equiv_cents = v_rev_usd
  where id = v_id;

  v_after := jsonb_build_object(
    'service_name', v_new_name,
    'service_category', v_new_category,
    'revenue_cents', v_new_revenue,
    'currency', v_new_currency,
    'sold_at', v_new_sold_at,
    'staff_name', v_new_staff,
    'client_note', v_new_note,
    'customer_name', v_new_customer,
    'customer_phone', v_new_phone,
    'customer_facebook', v_new_facebook,
    'product_usage', v_new_usage,
    'revenue_usd_equiv_cents', v_rev_usd
  );

  insert into public.service_logs_edit_log (
    service_log_id, edited_by, edit_reason, before_values, after_values
  ) values (
    v_id, v_uid, v_reason, v_before, v_after
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

comment on function public.admin_edit_service_log(jsonb) is
  'Manager/owner service_log correction: restores prior product usage stock, applies new usage, updates row in place, writes audit log.';

revoke all on function public.admin_edit_service_log(jsonb) from public;
grant execute on function public.admin_edit_service_log(jsonb) to authenticated;
