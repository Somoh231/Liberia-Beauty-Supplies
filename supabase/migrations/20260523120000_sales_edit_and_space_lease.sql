-- Retail sale editing (manager/owner) with inventory ledger + audit trail.
-- Standalone weekly space lease / rental payments (operational revenue).

-- ---------------------------------------------------------------------------
-- Extend inventory movement types for sale edits
-- ---------------------------------------------------------------------------
alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;

alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (movement_type in (
    'purchase', 'retail_sale', 'service_usage', 'manual_adjustment', 'correction',
    'damaged', 'expired', 'restock', 'opening_balance',
    'sale_edit_restore', 'sale_edit_deduct'
  ));

-- ---------------------------------------------------------------------------
-- Sales edit audit log (immutable)
-- ---------------------------------------------------------------------------
create table if not exists public.sales_edit_log (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz not null default now(),
  edit_reason text not null,
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb
);

create index if not exists sales_edit_log_sale_idx on public.sales_edit_log (sale_id, edited_at desc);

comment on table public.sales_edit_log is
  'Immutable audit trail for manager/owner retail sale corrections (qty, product, price, date).';

alter table public.sales_edit_log enable row level security;

drop policy if exists "sales_edit_log_select_admin" on public.sales_edit_log;
create policy "sales_edit_log_select_admin"
  on public.sales_edit_log for select
  to authenticated
  using (public.is_salon_portal_admin());

-- ---------------------------------------------------------------------------
-- Helper: apply signed qty delta with movement ledger context
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
    and i.deleted_at is null
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

revoke all on function public.apply_inventory_qty_delta(uuid, numeric, text, text, uuid, text) from public;
grant execute on function public.apply_inventory_qty_delta(uuid, numeric, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: admin_edit_retail_sale
-- ---------------------------------------------------------------------------
create or replace function public.admin_edit_retail_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sale_id uuid := nullif(trim(p_payload->>'sale_id'), '')::uuid;
  v_reason text := trim(coalesce(p_payload->>'edit_reason', ''));
  v_old public.sales%rowtype;
  v_new_item uuid := nullif(trim(p_payload->>'inventory_item_id'), '')::uuid;
  v_new_qty numeric(14, 4);
  v_new_price bigint;
  v_new_currency text;
  v_new_sold_at timestamptz;
  v_new_customer text;
  v_new_notes text;
  v_fx_ngn numeric;
  v_wac_usd bigint;
  v_avg_cost bigint;
  v_rev_usd bigint;
  v_gp_usd bigint;
  v_log_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_day text;
begin
  if not public.is_salon_portal_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if v_sale_id is null then
    raise exception 'invalid_sale_id' using errcode = 'P0001';
  end if;
  if length(v_reason) < 3 then
    raise exception 'edit_reason_required' using errcode = 'P0001';
  end if;

  select * into strict v_old from public.sales where id = v_sale_id for update;

  v_new_item := coalesce(v_new_item, v_old.inventory_item_id);
  v_new_qty := coalesce((p_payload->>'qty')::numeric, v_old.qty);
  v_new_price := coalesce((p_payload->>'unit_price_cents')::bigint, v_old.unit_price_cents);
  v_new_currency := coalesce(nullif(trim(p_payload->>'currency'), ''), v_old.currency);

  if v_new_qty is null or v_new_qty <= 0 then
    raise exception 'invalid_qty' using errcode = 'P0001';
  end if;
  if v_new_price is null or v_new_price < 0 then
    raise exception 'invalid_price' using errcode = 'P0001';
  end if;
  if v_new_currency not in ('USD', 'LRD', 'NGN') then
    raise exception 'invalid_currency' using errcode = 'P0001';
  end if;

  v_day := nullif(trim(p_payload->>'sale_date'), '');
  if v_day is not null and v_day ~ '^\d{4}-\d{2}-\d{2}$' then
    v_new_sold_at := (v_day || 'T12:00:00.000Z')::timestamptz;
  else
    v_new_sold_at := v_old.sold_at;
  end if;

  v_new_customer := case when p_payload ? 'customer_name' then nullif(trim(p_payload->>'customer_name'), '') else v_old.customer_name end;
  v_new_notes := case when p_payload ? 'notes' then nullif(trim(p_payload->>'notes'), '') else v_old.notes end;

  v_before := jsonb_build_object(
    'inventory_item_id', v_old.inventory_item_id,
    'qty', v_old.qty,
    'unit_price_cents', v_old.unit_price_cents,
    'unit_cost_cents', v_old.unit_cost_cents,
    'currency', v_old.currency,
    'sold_at', v_old.sold_at,
    'customer_name', v_old.customer_name,
    'notes', v_old.notes,
    'revenue_usd_equiv_cents', v_old.revenue_usd_equiv_cents,
    'gross_profit_usd_cents', v_old.gross_profit_usd_cents
  );

  -- Restore original sale quantity to inventory
  perform public.apply_inventory_qty_delta(
    v_old.inventory_item_id,
    v_old.qty,
    'sale_edit_restore',
    'sale',
    v_sale_id,
    format('Sale edit restore (%s)', v_reason)
  );

  -- Validate and snapshot cost basis for new line
  select coalesce(i.weighted_avg_landed_usd_cents, 0),
         i.avg_unit_cost_cents,
         coalesce(nullif(i.fx_ngn_per_usd, 0), public.operational_ngn_per_usd())
    into v_wac_usd, v_avg_cost, v_fx_ngn
  from public.inventory_items i
  where i.id = v_new_item
    and i.deleted_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Deduct new sale quantity
  perform public.apply_inventory_qty_delta(
    v_new_item,
    -v_new_qty,
    'sale_edit_deduct',
    'sale',
    v_sale_id,
    format('Sale edit deduct (%s)', v_reason)
  );

  if v_new_currency = 'USD' then
    v_rev_usd := round(v_new_qty * v_new_price);
  elsif v_new_currency = 'LRD' then
    v_rev_usd := round((v_new_qty * v_new_price)::numeric / public.operational_lrd_per_usd());
  elsif v_new_currency = 'NGN' then
    v_rev_usd := round((v_new_qty * v_new_price)::numeric / v_fx_ngn);
  else
    v_rev_usd := round(v_new_qty * v_new_price);
  end if;

  v_gp_usd := greatest(0, v_rev_usd - round(v_new_qty * v_wac_usd));

  update public.sales
  set
    inventory_item_id = v_new_item,
    qty = v_new_qty,
    unit_price_cents = v_new_price,
    unit_cost_cents = v_avg_cost,
    currency = v_new_currency,
    sold_at = v_new_sold_at,
    customer_name = v_new_customer,
    notes = v_new_notes,
    revenue_usd_equiv_cents = v_rev_usd,
    gross_profit_usd_cents = v_gp_usd
  where id = v_sale_id;

  v_after := jsonb_build_object(
    'inventory_item_id', v_new_item,
    'qty', v_new_qty,
    'unit_price_cents', v_new_price,
    'unit_cost_cents', v_avg_cost,
    'currency', v_new_currency,
    'sold_at', v_new_sold_at,
    'customer_name', v_new_customer,
    'notes', v_new_notes,
    'revenue_usd_equiv_cents', v_rev_usd,
    'gross_profit_usd_cents', v_gp_usd
  );

  insert into public.sales_edit_log (sale_id, edited_by, edit_reason, before_values, after_values)
  values (v_sale_id, v_uid, v_reason, v_before, v_after)
  returning id into v_log_id;

  return v_log_id;
end;
$$;

comment on function public.admin_edit_retail_sale(jsonb) is
  'Manager/owner sale correction: restores prior stock, applies new deduction, updates sale row, writes audit log.';

revoke all on function public.admin_edit_retail_sale(jsonb) from public;
grant execute on function public.admin_edit_retail_sale(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Space lease / rental payments (weekly operational log)
-- ---------------------------------------------------------------------------
create table if not exists public.space_lease_payments (
  id uuid primary key default gen_random_uuid(),
  stylist_name text not null,
  week_start_date date not null,
  week_end_date date not null,
  amount_cents bigint not null,
  currency text not null default 'USD' check (currency in ('USD', 'LRD', 'NGN')),
  notes text,
  created_by uuid references public.users (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint space_lease_payments_dates check (week_end_date >= week_start_date),
  constraint space_lease_payments_amount_nonneg check (amount_cents >= 0)
);

create index if not exists space_lease_payments_week_idx
  on public.space_lease_payments (week_start_date desc, stylist_name);

comment on table public.space_lease_payments is
  'Weekly booth/space rental payments from stylists — operating revenue, separate from retail GP.';

drop trigger if exists tr_space_lease_payments_updated_at on public.space_lease_payments;
create trigger tr_space_lease_payments_updated_at
  before update on public.space_lease_payments
  for each row execute function public.set_updated_at();

alter table public.space_lease_payments enable row level security;

drop policy if exists "space_lease_payments_select_portal" on public.space_lease_payments;
create policy "space_lease_payments_select_portal"
  on public.space_lease_payments for select
  to authenticated
  using (public.can_access_admin_portal());

drop policy if exists "space_lease_payments_write_admin" on public.space_lease_payments;
create policy "space_lease_payments_write_admin"
  on public.space_lease_payments for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());
