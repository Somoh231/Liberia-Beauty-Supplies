-- Admin inventory correction layer: audit log, add-on flag, transactional admin update RPC.
-- Staff remain read-only for protected fields via existing RLS (is_salon_portal_admin on update).

-- ---------------------------------------------------------------------------
-- Add-on SKU flag (lightweight attachable products)
-- ---------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists is_addon boolean not null default false;

comment on column public.inventory_items.is_addon is
  'When true, product may be attached as a lightweight add-on on sales/services.';

-- ---------------------------------------------------------------------------
-- Correction audit log (price/qty before & after)
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_correction_log (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  corrected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  audit_reason text not null,
  movement_type text,
  quantity_before numeric(14, 4),
  quantity_after numeric(14, 4),
  avg_unit_cost_cents_before bigint,
  avg_unit_cost_cents_after bigint,
  default_unit_price_cents_before bigint,
  default_unit_price_cents_after bigint,
  sell_price_usd_cents_before bigint,
  sell_price_usd_cents_after bigint,
  sell_price_lrd_cents_before bigint,
  sell_price_lrd_cents_after bigint,
  weighted_avg_landed_usd_cents_before bigint,
  weighted_avg_landed_usd_cents_after bigint,
  fx_ngn_per_usd_before numeric,
  fx_ngn_per_usd_after numeric,
  active_before boolean,
  active_after boolean,
  archived_before boolean,
  archived_after boolean,
  change_summary jsonb not null default '{}'::jsonb
);

create index if not exists inventory_correction_log_item_idx
  on public.inventory_correction_log (inventory_item_id, created_at desc);

comment on table public.inventory_correction_log is
  'Immutable audit trail for admin inventory corrections (qty, pricing, status).';

alter table public.inventory_correction_log enable row level security;

drop policy if exists "inventory_correction_log_select_admin" on public.inventory_correction_log;
create policy "inventory_correction_log_select_admin"
  on public.inventory_correction_log for select
  to authenticated
  using (public.is_salon_portal_admin());

-- ---------------------------------------------------------------------------
-- Admin correction RPC — sets movement context, updates row, writes audit log
-- ---------------------------------------------------------------------------
create or replace function public.admin_correct_inventory_item(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := nullif(trim(p_payload->>'inventory_item_id'), '')::uuid;
  v_old public.inventory_items%rowtype;
  v_reason text := trim(coalesce(p_payload->>'audit_reason', ''));
  v_mov_type text := coalesce(nullif(trim(p_payload->>'movement_type'), ''), 'manual_adjustment');
  v_log_id uuid;
  v_qty numeric(14, 4);
  v_cost bigint;
  v_cc text;
  v_def_price bigint;
  v_def_cur text;
  v_fx numeric;
  v_landed bigint;
  v_store bigint;
  v_sell_usd bigint;
  v_sell_lrd bigint;
  v_wac bigint;
  v_active boolean;
  v_archived boolean;
  v_is_addon boolean;
  v_qty_changed boolean;
  v_pricing_changed boolean;
  v_status_changed boolean;
  v_pname text;
begin
  if not public.is_salon_portal_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_id is null then
    raise exception 'invalid_inventory_item_id' using errcode = 'P0001';
  end if;
  if v_mov_type not in ('manual_adjustment', 'correction', 'damaged', 'expired') then
    raise exception 'invalid_movement_type' using errcode = 'P0001';
  end if;

  select * into strict v_old from public.inventory_items where id = v_id for update;

  v_pname := trim(coalesce(p_payload->>'product_name', ''));
  if length(v_pname) < 2 then
    raise exception 'invalid_product_name' using errcode = 'P0001';
  end if;

  v_qty := coalesce((p_payload->>'quantity_on_hand')::numeric, v_old.quantity_on_hand);
  if v_qty is null or v_qty < 0 then
    raise exception 'invalid_quantity' using errcode = 'P0001';
  end if;

  v_cost := coalesce((p_payload->>'avg_unit_cost_cents')::bigint, v_old.avg_unit_cost_cents);
  v_cc := coalesce(nullif(trim(p_payload->>'cost_currency'), ''), v_old.cost_currency);
  v_def_price := case when p_payload ? 'default_unit_price_cents' then (p_payload->>'default_unit_price_cents')::bigint else v_old.default_unit_price_cents end;
  v_def_cur := coalesce(nullif(trim(p_payload->>'default_price_currency'), ''), v_old.default_price_currency);
  v_fx := case when p_payload ? 'fx_ngn_per_usd' then (p_payload->>'fx_ngn_per_usd')::numeric else v_old.fx_ngn_per_usd end;
  v_landed := coalesce((p_payload->>'landed_usd_cents_per_unit')::bigint, coalesce(v_old.landed_usd_cents_per_unit, 0));
  v_store := case when p_payload ? 'store_price_usd_cents' then (p_payload->>'store_price_usd_cents')::bigint else v_old.store_price_usd_cents end;
  v_sell_usd := case when p_payload ? 'sell_price_usd_cents' then (p_payload->>'sell_price_usd_cents')::bigint else v_old.sell_price_usd_cents end;
  v_sell_lrd := case when p_payload ? 'sell_price_lrd_cents' then (p_payload->>'sell_price_lrd_cents')::bigint else v_old.sell_price_lrd_cents end;
  v_wac := case when p_payload ? 'weighted_avg_landed_usd_cents' then (p_payload->>'weighted_avg_landed_usd_cents')::bigint else v_old.weighted_avg_landed_usd_cents end;
  v_active := coalesce((p_payload->>'active')::boolean, v_old.active);
  v_archived := coalesce((p_payload->>'archived')::boolean, v_old.deleted_at is not null);
  v_is_addon := coalesce((p_payload->>'is_addon')::boolean, coalesce(v_old.is_addon, false));

  v_qty_changed := v_old.quantity_on_hand is distinct from v_qty;
  v_pricing_changed :=
    v_old.avg_unit_cost_cents is distinct from v_cost
    or v_old.cost_currency is distinct from v_cc
    or v_old.default_unit_price_cents is distinct from v_def_price
    or v_old.default_price_currency is distinct from v_def_cur
    or v_old.fx_ngn_per_usd is distinct from v_fx
    or coalesce(v_old.landed_usd_cents_per_unit, 0) is distinct from v_landed
    or v_old.store_price_usd_cents is distinct from v_store
    or v_old.sell_price_usd_cents is distinct from v_sell_usd
    or v_old.sell_price_lrd_cents is distinct from v_sell_lrd
    or coalesce(v_old.weighted_avg_landed_usd_cents, 0) is distinct from coalesce(v_wac, 0);
  v_status_changed :=
    v_old.active is distinct from v_active
    or (v_old.deleted_at is not null) is distinct from v_archived;

  if (v_qty_changed or v_pricing_changed or v_status_changed) and length(v_reason) < 3 then
    raise exception 'audit_reason_required' using errcode = 'P0001';
  end if;

  if v_qty_changed then
    perform set_config('salon.movement_type', v_mov_type, true);
    perform set_config('salon.movement_reference_type', 'admin_correction', true);
    perform set_config('salon.movement_notes', left(v_reason, 2000), true);
  end if;

  update public.inventory_items
  set
    product_name = v_pname,
    name = v_pname,
    sku = nullif(trim(coalesce(p_payload->>'sku', v_old.sku)), ''),
    unit = coalesce(nullif(left(trim(coalesce(p_payload->>'unit', v_old.unit)), 32), ''), 'each'),
    supplier_id = case
      when nullif(trim(p_payload->>'supplier_id'), '') is not null then (p_payload->>'supplier_id')::uuid
      else v_old.supplier_id
    end,
    category = nullif(trim(coalesce(p_payload->>'category', v_old.category)), ''),
    notes = nullif(trim(coalesce(p_payload->>'notes', v_old.notes)), ''),
    reorder_level = coalesce((p_payload->>'reorder_level')::numeric, v_old.reorder_level),
    reorder_point = coalesce((p_payload->>'reorder_level')::numeric, v_old.reorder_point),
    low_stock_threshold = coalesce((p_payload->>'low_stock_threshold')::numeric, v_old.low_stock_threshold),
    quantity_on_hand = v_qty,
    avg_unit_cost_cents = v_cost,
    cost_currency = v_cc,
    default_unit_price_cents = v_def_price,
    default_price_currency = v_def_cur,
    fx_ngn_per_usd = v_fx,
    landed_usd_cents_per_unit = v_landed,
    store_price_usd_cents = v_store,
    sell_price_usd_cents = v_sell_usd,
    sell_price_lrd_cents = v_sell_lrd,
    weighted_avg_landed_usd_cents = coalesce(v_wac, 0),
    active = case when v_archived then false else v_active end,
    deleted_at = case
      when v_archived and v_old.deleted_at is null then now()
      when not v_archived then null
      else v_old.deleted_at
    end,
    is_addon = v_is_addon,
    updated_by = v_uid,
    updated_at = now(),
    last_override_at = case when length(v_reason) >= 3 then now() else last_override_at end,
    last_override_by = case when length(v_reason) >= 3 then v_uid else last_override_by end,
    last_override_reason = case when length(v_reason) >= 3 then left(v_reason, 2000) else last_override_reason end
  where id = v_id;

  if v_qty_changed then
    perform set_config('salon.movement_type', '', true);
    perform set_config('salon.movement_reference_type', '', true);
    perform set_config('salon.movement_reference_id', '', true);
    perform set_config('salon.movement_notes', '', true);
  end if;

  insert into public.inventory_correction_log (
    inventory_item_id,
    corrected_by,
    audit_reason,
    movement_type,
    quantity_before,
    quantity_after,
    avg_unit_cost_cents_before,
    avg_unit_cost_cents_after,
    default_unit_price_cents_before,
    default_unit_price_cents_after,
    sell_price_usd_cents_before,
    sell_price_usd_cents_after,
    sell_price_lrd_cents_before,
    sell_price_lrd_cents_after,
    weighted_avg_landed_usd_cents_before,
    weighted_avg_landed_usd_cents_after,
    fx_ngn_per_usd_before,
    fx_ngn_per_usd_after,
    active_before,
    active_after,
    archived_before,
    archived_after,
    change_summary
  ) values (
    v_id,
    v_uid,
    left(v_reason, 2000),
    case when v_qty_changed then v_mov_type else null end,
    v_old.quantity_on_hand,
    v_qty,
    v_old.avg_unit_cost_cents,
    v_cost,
    v_old.default_unit_price_cents,
    v_def_price,
    v_old.sell_price_usd_cents,
    v_sell_usd,
    v_old.sell_price_lrd_cents,
    v_sell_lrd,
    v_old.weighted_avg_landed_usd_cents,
    v_wac,
    v_old.fx_ngn_per_usd,
    v_fx,
    v_old.active,
    case when v_archived then false else v_active end,
    v_old.deleted_at is not null,
    v_archived,
    jsonb_build_object(
      'quantity_changed', v_qty_changed,
      'pricing_changed', v_pricing_changed,
      'status_changed', v_status_changed,
      'cost_currency_before', v_old.cost_currency,
      'cost_currency_after', v_cc,
      'landed_usd_cents_before', coalesce(v_old.landed_usd_cents_per_unit, 0),
      'landed_usd_cents_after', v_landed,
      'store_price_usd_cents_before', v_old.store_price_usd_cents,
      'store_price_usd_cents_after', v_store,
      'is_addon_after', v_is_addon
    )
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

comment on function public.admin_correct_inventory_item(jsonb) is
  'Manager/admin inventory correction: movement ledger on qty change, full audit log, staff blocked by caller + RLS.';

revoke all on function public.admin_correct_inventory_item(jsonb) from public;
grant execute on function public.admin_correct_inventory_item(jsonb) to authenticated;
