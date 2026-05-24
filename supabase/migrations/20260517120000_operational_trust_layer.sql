-- =============================================================================
-- Operational trust: inventory movement ledger, cash reconciliation,
-- operational settings, lightweight inventory audit columns.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Operational settings (singleton id = 1). Nullable = fall back to app env.
-- ---------------------------------------------------------------------------
create table if not exists public.operational_settings (
  id smallint primary key default 1 check (id = 1),
  ngn_per_usd numeric(14, 4),
  lrd_per_usd numeric(14, 4),
  low_stock_threshold_default numeric(14, 4),
  margin_warning_pct numeric(6, 2),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

insert into public.operational_settings (id)
values (1)
on conflict (id) do nothing;

comment on table public.operational_settings is
  'Singleton FX and warning thresholds; nulls mean use application environment defaults.';

alter table public.operational_settings enable row level security;

drop policy if exists "operational_settings_select_portal" on public.operational_settings;
create policy "operational_settings_select_portal"
  on public.operational_settings for select
  to authenticated
  using (public.can_access_admin_portal());

drop policy if exists "operational_settings_write_admin" on public.operational_settings;
create policy "operational_settings_write_admin"
  on public.operational_settings for update
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

drop policy if exists "operational_settings_insert_admin" on public.operational_settings;
create policy "operational_settings_insert_admin"
  on public.operational_settings for insert
  to authenticated
  with check (public.is_salon_portal_admin());

-- ---------------------------------------------------------------------------
-- Daily cash reconciliation (one row per business date)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  business_date date not null,
  expected_usd_cents bigint not null default 0,
  actual_usd_cents bigint,
  variance_usd_cents bigint generated always as (coalesce(actual_usd_cents, 0) - expected_usd_cents) stored,
  expected_lrd_cents bigint not null default 0,
  actual_lrd_cents bigint,
  variance_lrd_cents bigint generated always as (coalesce(actual_lrd_cents, 0) - expected_lrd_cents) stored,
  notes text,
  reconciled_by uuid references public.users (id) on delete set null,
  reconciled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint daily_recon_one_per_day unique (business_date)
);

create index daily_recon_date_idx on public.daily_cash_reconciliations (business_date desc);

comment on table public.daily_cash_reconciliations is
  'End-of-day counted cash vs recorded sales (native USD/LRD); expected_* snapshot at reconcile time.';

alter table public.daily_cash_reconciliations enable row level security;

drop policy if exists "daily_recon_select_portal" on public.daily_cash_reconciliations;
create policy "daily_recon_select_portal"
  on public.daily_cash_reconciliations for select
  to authenticated
  using (public.can_access_admin_portal());

drop policy if exists "daily_recon_write_admin" on public.daily_cash_reconciliations;
create policy "daily_recon_write_admin"
  on public.daily_cash_reconciliations for insert
  to authenticated
  with check (public.is_salon_portal_admin());

drop policy if exists "daily_recon_update_admin" on public.daily_cash_reconciliations;
create policy "daily_recon_update_admin"
  on public.daily_cash_reconciliations for update
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

-- ---------------------------------------------------------------------------
-- Inventory movement ledger
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  movement_type text not null
    check (movement_type in (
      'purchase', 'retail_sale', 'service_usage', 'manual_adjustment', 'correction',
      'damaged', 'expired', 'restock', 'opening_balance'
    )),
  quantity_before numeric(14, 4) not null,
  quantity_change numeric(14, 4) not null,
  quantity_after numeric(14, 4) not null,
  unit_cost_basis_cents bigint not null default 0,
  fx_snapshot jsonb not null default '{}'::jsonb,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_movements_item_idx on public.inventory_movements (inventory_item_id, created_at desc);
create index inventory_movements_created_idx on public.inventory_movements (created_at desc);

comment on table public.inventory_movements is
  'Authoritative quantity change history; populated by DB triggers + inventory qty updates.';

alter table public.inventory_movements enable row level security;

drop policy if exists "inventory_movements_select_portal" on public.inventory_movements;
create policy "inventory_movements_select_portal"
  on public.inventory_movements for select
  to authenticated
  using (public.can_access_admin_portal());

-- Insert path: trigger runs in user session; allow portal operators (staff sales → movements)
drop policy if exists "inventory_movements_insert_portal" on public.inventory_movements;
create policy "inventory_movements_insert_portal"
  on public.inventory_movements for insert
  to authenticated
  with check (public.can_access_admin_portal());

-- ---------------------------------------------------------------------------
-- FX snapshot helper (settings row or hard fallbacks)
-- ---------------------------------------------------------------------------
create or replace function public.operational_fx_snapshot_row()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ngn_per_usd',
      coalesce((select s.ngn_per_usd from public.operational_settings s where s.id = 1), 1550::numeric),
    'lrd_per_usd',
      coalesce((select s.lrd_per_usd from public.operational_settings s where s.id = 1), 190::numeric)
  );
$$;

revoke all on function public.operational_fx_snapshot_row() from public;
grant execute on function public.operational_fx_snapshot_row() to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory audit columns (override / accountability)
-- ---------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists updated_by uuid references public.users (id) on delete set null,
  add column if not exists last_override_at timestamptz,
  add column if not exists last_override_by uuid references public.users (id) on delete set null,
  add column if not exists last_override_reason text;

comment on column public.inventory_items.last_override_reason is
  'Short operator reason for last material correction, qty change, or pricing override.';

-- ---------------------------------------------------------------------------
-- Movement logger: INSERT opening balance, UPDATE qty deltas
-- ---------------------------------------------------------------------------
create or replace function public.trg_inventory_items_qty_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_ref_t text;
  v_ref_id uuid;
  v_notes text;
  v_before numeric;
  v_after numeric;
  v_delta numeric;
  v_basis bigint;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.quantity_on_hand, 0) <= 0 then
      return new;
    end if;
    v_basis := coalesce(nullif(new.weighted_avg_landed_usd_cents, 0), new.avg_unit_cost_cents, 0);
    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity_before, quantity_change, quantity_after,
      unit_cost_basis_cents, fx_snapshot, reference_type, reference_id, notes, created_by
    ) values (
      new.id,
      'opening_balance',
      0,
      new.quantity_on_hand,
      new.quantity_on_hand,
      v_basis,
      public.operational_fx_snapshot_row(),
      null,
      null,
      'Product created with opening quantity',
      auth.uid()
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.quantity_on_hand is not distinct from new.quantity_on_hand then
      return new;
    end if;
    v_before := old.quantity_on_hand;
    v_after := new.quantity_on_hand;
    v_delta := v_after - v_before;

    v_type := nullif(trim(coalesce(current_setting('salon.movement_type', true), '')), '');
    v_type := coalesce(v_type, 'manual_adjustment');

    v_ref_t := nullif(trim(coalesce(current_setting('salon.movement_reference_type', true), '')), '');
    v_notes := nullif(trim(coalesce(current_setting('salon.movement_notes', true), '')), '');

    begin
      v_ref_id := nullif(trim(coalesce(current_setting('salon.movement_reference_id', true), '')), '')::uuid;
    exception when others then
      v_ref_id := null;
    end;

    v_basis := coalesce(nullif(new.weighted_avg_landed_usd_cents, 0), new.avg_unit_cost_cents, 0);

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity_before, quantity_change, quantity_after,
      unit_cost_basis_cents, fx_snapshot, reference_type, reference_id, notes, created_by
    ) values (
      new.id,
      v_type,
      v_before,
      v_delta,
      v_after,
      v_basis,
      public.operational_fx_snapshot_row(),
      v_ref_t,
      v_ref_id,
      v_notes,
      auth.uid()
    );

    perform set_config('salon.movement_type', '', true);
    perform set_config('salon.movement_reference_type', '', true);
    perform set_config('salon.movement_reference_id', '', true);
    perform set_config('salon.movement_notes', '', true);
  end if;

  return new;
end;
$$;

drop trigger if exists tr_inventory_items_qty_movement_ins on public.inventory_items;
create trigger tr_inventory_items_qty_movement_ins
  after insert on public.inventory_items
  for each row execute function public.trg_inventory_items_qty_movement();

drop trigger if exists tr_inventory_items_qty_movement_upd on public.inventory_items;
create trigger tr_inventory_items_qty_movement_upd
  after update of quantity_on_hand on public.inventory_items
  for each row execute function public.trg_inventory_items_qty_movement();

-- ---------------------------------------------------------------------------
-- Sales → set movement context, decrement stock
-- ---------------------------------------------------------------------------
create or replace function public.trg_sales_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('salon.movement_type', 'retail_sale', true);
  perform set_config('salon.movement_reference_type', 'sale', true);
  perform set_config('salon.movement_reference_id', new.id::text, true);
  perform set_config('salon.movement_notes', left(coalesce(new.notes, ''), 2000), true);

  update public.inventory_items
  set quantity_on_hand = quantity_on_hand - new.qty,
      updated_at = now()
  where id = new.inventory_item_id;

  perform set_config('salon.movement_type', '', true);
  perform set_config('salon.movement_reference_type', '', true);
  perform set_config('salon.movement_reference_id', '', true);
  perform set_config('salon.movement_notes', '', true);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Service usage → movement context per line
-- ---------------------------------------------------------------------------
create or replace function public.trg_service_logs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  el jsonb;
  v_iid uuid;
  v_qty numeric(14, 4);
  v_on_hand numeric(14, 4);
begin
  if new.product_usage is null or jsonb_array_length(new.product_usage) = 0 then
    return new;
  end if;

  for el in select * from jsonb_array_elements(new.product_usage)
  loop
    begin
      v_iid := (el->>'inventory_item_id')::uuid;
      v_qty := (el->>'qty')::numeric(14, 4);
    exception when others then
      raise exception 'invalid_product_usage' using errcode = 'P0001';
    end;

    if v_iid is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid_product_usage' using errcode = 'P0001';
    end if;

    select i.quantity_on_hand
      into strict v_on_hand
    from public.inventory_items i
    where i.id = v_iid
    for update;

    if v_on_hand + 1e-9 < v_qty then
      raise exception 'insufficient_stock_for_service_usage' using errcode = 'P0001';
    end if;

    perform set_config('salon.movement_type', 'service_usage', true);
    perform set_config('salon.movement_reference_type', 'service_log', true);
    perform set_config('salon.movement_reference_id', new.id::text, true);
    perform set_config('salon.movement_notes', left(coalesce(new.service_name, '') || ' · usage', 2000), true);

    update public.inventory_items
    set quantity_on_hand = quantity_on_hand - v_qty, updated_at = now()
    where id = v_iid;

    perform set_config('salon.movement_type', '', true);
    perform set_config('salon.movement_reference_type', '', true);
    perform set_config('salon.movement_reference_id', '', true);
    perform set_config('salon.movement_notes', '', true);
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchase receive → movement context per line
-- ---------------------------------------------------------------------------
create or replace function public.apply_purchase_to_inventory(p_purchase_id uuid, p_currency text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_old_qty numeric(14, 4);
  v_old_cost bigint;
  v_old_wac_usd bigint;
  v_old_cc text;
  v_new_qty numeric(14, 4);
  v_new_cost bigint;
  v_new_wac_usd bigint;
  v_line_landed_usd bigint;
  v_purchase_fx numeric;
  v_item_fx numeric;
  v_item_landed bigint;
  v_ship_usd bigint;
  v_line_value numeric;
  v_total_value numeric;
  v_ship_alloc bigint;
begin
  select p.fx_ngn_per_usd, coalesce(p.shipping_landed_usd_cents, 0)
    into v_purchase_fx, v_ship_usd
  from public.purchases p
  where p.id = p_purchase_id;

  select coalesce(sum(pl.qty * pl.unit_cost_cents::numeric), 0)
    into v_total_value
  from public.purchase_lines pl
  where pl.purchase_id = p_purchase_id;

  for r in
    select pl.inventory_item_id, pl.qty, pl.unit_cost_cents
    from public.purchase_lines pl
    where pl.purchase_id = p_purchase_id
  loop
    select i.quantity_on_hand, i.avg_unit_cost_cents, i.cost_currency,
           coalesce(i.weighted_avg_landed_usd_cents, 0),
           i.fx_ngn_per_usd, coalesce(i.landed_usd_cents_per_unit, 0)
      into strict v_old_qty, v_old_cost, v_old_cc, v_old_wac_usd, v_item_fx, v_item_landed
    from public.inventory_items i
    where i.id = r.inventory_item_id
    for update;

    if v_total_value > 0 then
      v_line_value := r.qty * r.unit_cost_cents;
      v_ship_alloc := round((v_line_value / v_total_value) * v_ship_usd)::bigint;
    else
      v_ship_alloc := 0;
    end if;

    v_line_landed_usd := public.purchase_unit_cost_to_usd_cents(
      r.unit_cost_cents,
      p_currency,
      v_purchase_fx,
      v_item_fx,
      v_item_landed
    ) + case when r.qty > 0 then round(v_ship_alloc::numeric / r.qty)::bigint else 0 end;

    v_new_qty := v_old_qty + r.qty;

    if v_old_qty <= 0 or v_old_cc is distinct from p_currency then
      v_new_cost := r.unit_cost_cents;
      v_new_wac_usd := v_line_landed_usd;
    else
      v_new_cost := round(
        (v_old_cost::numeric * v_old_qty + r.unit_cost_cents::numeric * r.qty) / nullif(v_new_qty, 0)
      )::bigint;
      v_new_wac_usd := round(
        (v_old_wac_usd::numeric * v_old_qty + v_line_landed_usd::numeric * r.qty) / nullif(v_new_qty, 0)
      )::bigint;
    end if;

    perform set_config('salon.movement_type', 'purchase', true);
    perform set_config('salon.movement_reference_type', 'purchase', true);
    perform set_config('salon.movement_reference_id', p_purchase_id::text, true);
    perform set_config('salon.movement_notes', 'Purchase received — line stock increase', true);

    update public.inventory_items
    set
      quantity_on_hand = v_new_qty,
      avg_unit_cost_cents = v_new_cost,
      cost_currency = p_currency,
      weighted_avg_landed_usd_cents = v_new_wac_usd,
      updated_at = now()
    where id = r.inventory_item_id;

    perform set_config('salon.movement_type', '', true);
    perform set_config('salon.movement_reference_type', '', true);
    perform set_config('salon.movement_reference_id', '', true);
    perform set_config('salon.movement_notes', '', true);
  end loop;
end;
$$;
