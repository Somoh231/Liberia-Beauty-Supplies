-- Owner-only active inventory catalog reset (soft archive + ledger movements).
-- Also extends movement types and relaxes qty-delta helper for archived SKU references.

-- ---------------------------------------------------------------------------
-- Extend inventory movement types (catalog reset + preserve sale-edit types)
-- ---------------------------------------------------------------------------
alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;

alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (movement_type in (
    'purchase', 'retail_sale', 'service_usage', 'manual_adjustment', 'correction',
    'damaged', 'expired', 'restock', 'opening_balance',
    'sale_edit_restore', 'sale_edit_deduct',
    'catalog_reset'
  ));

-- ---------------------------------------------------------------------------
-- Catalog reset audit log
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_catalog_reset_log (
  id uuid primary key default gen_random_uuid(),
  reset_by uuid references auth.users (id) on delete set null,
  reset_at timestamptz not null default now(),
  products_archived int not null default 0,
  total_qty_cleared numeric(14, 4) not null default 0,
  inventory_value_cleared_usd_cents bigint not null default 0,
  reason text not null
);

create index if not exists inventory_catalog_reset_log_reset_at_idx
  on public.inventory_catalog_reset_log (reset_at desc);

comment on table public.inventory_catalog_reset_log is
  'Immutable audit trail when owner clears the active inventory catalog (soft archive).';

alter table public.inventory_catalog_reset_log enable row level security;

drop policy if exists "inventory_catalog_reset_log_select_admin" on public.inventory_catalog_reset_log;
create policy "inventory_catalog_reset_log_select_admin"
  on public.inventory_catalog_reset_log for select
  to authenticated
  using (public.is_salon_portal_admin());

-- ---------------------------------------------------------------------------
-- Helper: apply signed qty delta (allow archived SKUs — sale edits / corrections)
-- ---------------------------------------------------------------------------
create or replace function public.apply_inventory_qty_delta(
  p_item_id uuid,
  p_delta numeric,
  p_movement_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before numeric(14, 4);
  v_after numeric(14, 4);
begin
  if p_delta = 0 then
    return;
  end if;

  select i.quantity_on_hand
    into strict v_before
  from public.inventory_items i
  where i.id = p_item_id
  for update;

  v_after := v_before + p_delta;
  if v_after < -1e-9 then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  perform set_config('salon.movement_type', p_movement_type, true);
  perform set_config('salon.movement_reference_type', coalesce(p_reference_type, ''), true);
  perform set_config('salon.movement_reference_id', coalesce(p_reference_id::text, ''), true);
  perform set_config('salon.movement_notes', left(coalesce(p_notes, ''), 2000), true);

  update public.inventory_items
  set quantity_on_hand = v_after,
      updated_at = now()
  where id = p_item_id;

  perform set_config('salon.movement_type', '', true);
  perform set_config('salon.movement_reference_type', '', true);
  perform set_config('salon.movement_reference_id', '', true);
  perform set_config('salon.movement_notes', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin_clear_active_inventory_catalog (owner only)
-- ---------------------------------------------------------------------------
create or replace function public.admin_clear_active_inventory_catalog(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := trim(coalesce(p_payload->>'reason', ''));
  v_count int := 0;
  v_qty_cleared numeric(14, 4) := 0;
  v_value_cleared bigint := 0;
  v_log_id uuid;
  r record;
  v_qty numeric(14, 4);
  v_wac bigint;
  v_line_value bigint;
begin
  if not public.is_salon_owner() then
    raise exception 'forbidden_owner_required' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  for r in
    select i.*
    from public.inventory_items i
    where i.deleted_at is null
      and i.active = true
    order by i.product_code nulls last, i.created_at
    for update
  loop
    v_qty := coalesce(r.quantity_on_hand, 0);
    v_wac := coalesce(nullif(r.weighted_avg_landed_usd_cents, 0), r.avg_unit_cost_cents, 0);
    v_line_value := round(v_qty * v_wac);

    if v_qty > 0 then
      perform public.apply_inventory_qty_delta(
        r.id,
        -v_qty,
        'catalog_reset',
        'catalog_reset',
        null,
        'Inventory catalog reset / active catalog cleared'
      );
    end if;

    update public.inventory_items
    set
      active = false,
      deleted_at = now(),
      quantity_on_hand = 0,
      updated_by = v_uid,
      updated_at = now()
    where id = r.id;

    v_count := v_count + 1;
    v_qty_cleared := v_qty_cleared + v_qty;
    v_value_cleared := v_value_cleared + v_line_value;
  end loop;

  insert into public.inventory_catalog_reset_log (
    reset_by,
    reason,
    products_archived,
    total_qty_cleared,
    inventory_value_cleared_usd_cents
  )
  values (
    v_uid,
    v_reason,
    v_count,
    v_qty_cleared,
    v_value_cleared
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

comment on function public.admin_clear_active_inventory_catalog(jsonb) is
  'Owner-only: archives all active inventory_items, zeros on-hand qty with catalog_reset ledger entries, preserves historical references.';

revoke all on function public.admin_clear_active_inventory_catalog(jsonb) from public;
grant execute on function public.admin_clear_active_inventory_catalog(jsonb) to authenticated;
