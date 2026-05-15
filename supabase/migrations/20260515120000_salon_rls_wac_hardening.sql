-- =============================================================================
-- Operational hardening: role-based RLS, weighted-average landed USD cost,
-- canonical sale cost snapshots, legacy weekly stock trigger disabled.
-- Safe to re-run where noted.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers (security definer)
-- ---------------------------------------------------------------------------
create or replace function public.is_salon_portal_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.roles r on r.id = u.role_id
    where u.id = auth.uid()
      and u.is_active = true
      and r.slug in ('owner', 'admin', 'manager')
  );
$$;

comment on function public.is_salon_portal_admin() is
  'Owner, legacy admin, or manager — full operational write access.';

create or replace function public.is_salon_restricted_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    join public.roles r on r.id = u.role_id
    where u.id = auth.uid()
      and u.is_active = true
      and r.slug = 'staff'
  );
$$;

comment on function public.is_salon_restricted_staff() is
  'Front-desk staff — sales/service entry and inventory read only.';

revoke all on function public.is_salon_portal_admin() from public;
revoke all on function public.is_salon_restricted_staff() from public;
grant execute on function public.is_salon_portal_admin() to authenticated;
grant execute on function public.is_salon_restricted_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Weighted average landed USD cost (canonical cost basis)
-- ---------------------------------------------------------------------------
alter table public.inventory_items
  add column if not exists weighted_avg_landed_usd_cents bigint not null default 0;

comment on column public.inventory_items.weighted_avg_landed_usd_cents is
  'Weighted-average unit cost in USD cents (purchase + landed). Canonical basis for valuation and gross profit.';

alter table public.purchases
  add column if not exists fx_ngn_per_usd numeric(14, 4),
  add column if not exists shipping_landed_usd_cents bigint not null default 0;

comment on column public.purchases.fx_ngn_per_usd is 'NGN per 1 USD for this shipment when currency is NGN.';
comment on column public.purchases.shipping_landed_usd_cents is
  'Total landed/shipping adjustment for the purchase in USD cents, allocated across lines by value.';

-- ---------------------------------------------------------------------------
-- Convert purchase line unit cost → USD cents (landed unit, excl. shipment split)
-- ---------------------------------------------------------------------------
create or replace function public.purchase_unit_cost_to_usd_cents(
  p_unit_cost_cents bigint,
  p_currency text,
  p_fx_ngn_per_usd numeric,
  p_item_fx_ngn_per_usd numeric,
  p_item_landed_usd_cents bigint
)
returns bigint
language plpgsql
immutable
as $$
declare
  v_fx numeric;
  v_base_usd bigint;
begin
  v_fx := coalesce(nullif(p_fx_ngn_per_usd, 0), nullif(p_item_fx_ngn_per_usd, 0), 1550);

  if p_currency = 'USD' then
    v_base_usd := p_unit_cost_cents;
  elsif p_currency = 'NGN' then
    v_base_usd := round(p_unit_cost_cents::numeric / v_fx)::bigint;
  elsif p_currency = 'LRD' then
    v_base_usd := round(p_unit_cost_cents::numeric / 190)::bigint;
  else
    v_base_usd := p_unit_cost_cents;
  end if;

  return greatest(0, v_base_usd + coalesce(p_item_landed_usd_cents, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- Purchase received → qty + native avg cost + weighted USD landed average
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

    update public.inventory_items
    set
      quantity_on_hand = v_new_qty,
      avg_unit_cost_cents = v_new_cost,
      cost_currency = p_currency,
      weighted_avg_landed_usd_cents = v_new_wac_usd,
      updated_at = now()
    where id = r.inventory_item_id;
  end loop;
end;
$$;

-- Backfill weighted average from existing cost fields where zero
update public.inventory_items i
set weighted_avg_landed_usd_cents = greatest(0, round(
  case
    when i.cost_currency = 'USD' then coalesce(i.avg_unit_cost_cents, 0) + coalesce(i.landed_usd_cents_per_unit, 0)
    when i.cost_currency = 'NGN' then
      round(coalesce(i.avg_unit_cost_cents, 0)::numeric / coalesce(nullif(i.fx_ngn_per_usd, 0), 1550))
      + coalesce(i.landed_usd_cents_per_unit, 0)
    when i.cost_currency = 'LRD' then
      round(coalesce(i.avg_unit_cost_cents, 0)::numeric / 190)
      + coalesce(i.landed_usd_cents_per_unit, 0)
    else coalesce(i.avg_unit_cost_cents, 0)
  end
)::bigint)
where coalesce(i.weighted_avg_landed_usd_cents, 0) = 0
  and coalesce(i.avg_unit_cost_cents, 0) > 0;

-- ---------------------------------------------------------------------------
-- Sales: snapshot WAC on insert; block update/delete for staff
-- ---------------------------------------------------------------------------
create or replace function public.trg_sales_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qty numeric(14, 4);
  v_wac_usd bigint;
  v_avg_cost bigint;
  v_rev_usd bigint;
  v_fx_ngn numeric;
begin
  select i.quantity_on_hand,
         coalesce(i.weighted_avg_landed_usd_cents, 0),
         i.avg_unit_cost_cents,
         coalesce(i.fx_ngn_per_usd, 1550)
    into strict v_qty, v_wac_usd, v_avg_cost, v_fx_ngn
  from public.inventory_items i
  where i.id = new.inventory_item_id
  for update;

  if v_qty + 1e-9 < new.qty then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;

  if new.unit_cost_cents is null or new.unit_cost_cents = 0 then
    new.unit_cost_cents := v_avg_cost;
  end if;

  if new.revenue_usd_equiv_cents is null then
    if new.currency = 'USD' then
      v_rev_usd := round(new.qty * new.unit_price_cents);
    elsif new.currency = 'LRD' then
      v_rev_usd := round((new.qty * new.unit_price_cents)::numeric / 190);
    elsif new.currency = 'NGN' then
      v_rev_usd := round((new.qty * new.unit_price_cents)::numeric / v_fx_ngn);
    else
      v_rev_usd := round(new.qty * new.unit_price_cents);
    end if;
    new.revenue_usd_equiv_cents := v_rev_usd;
  end if;

  if new.gross_profit_usd_cents is null then
    new.gross_profit_usd_cents := greatest(
      0,
      new.revenue_usd_equiv_cents - round(new.qty * v_wac_usd)
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Legacy weekly product lines must NOT decrement stock (canonical flow = sales)
-- ---------------------------------------------------------------------------
drop trigger if exists tr_weekly_product_sales_after_ins on public.weekly_product_sales;

-- ---------------------------------------------------------------------------
-- RLS: replace permissive portal-wide policies
-- ---------------------------------------------------------------------------

-- inventory_items
drop policy if exists "salon_inventory_staff" on public.inventory_items;
drop policy if exists "inventory_items_select_portal" on public.inventory_items;
drop policy if exists "inventory_items_insert_admin" on public.inventory_items;
drop policy if exists "inventory_items_update_admin" on public.inventory_items;
drop policy if exists "inventory_items_delete_admin" on public.inventory_items;

create policy "inventory_items_select_portal"
  on public.inventory_items for select
  to authenticated
  using (public.can_access_admin_portal() and deleted_at is null);

create policy "inventory_items_insert_admin"
  on public.inventory_items for insert
  to authenticated
  with check (public.is_salon_portal_admin());

create policy "inventory_items_update_admin"
  on public.inventory_items for update
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

create policy "inventory_items_delete_admin"
  on public.inventory_items for delete
  to authenticated
  using (public.is_salon_portal_admin());

-- sales
drop policy if exists "salon_sales_staff" on public.sales;
drop policy if exists "sales_select_portal" on public.sales;
drop policy if exists "sales_insert_portal" on public.sales;
drop policy if exists "sales_update_admin" on public.sales;
drop policy if exists "sales_delete_admin" on public.sales;

create policy "sales_select_portal"
  on public.sales for select
  to authenticated
  using (public.can_access_admin_portal());

create policy "sales_insert_portal"
  on public.sales for insert
  to authenticated
  with check (public.can_access_admin_portal());

create policy "sales_update_admin"
  on public.sales for update
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

create policy "sales_delete_admin"
  on public.sales for delete
  to authenticated
  using (public.is_salon_portal_admin());

-- service_logs
drop policy if exists "salon_service_logs_staff" on public.service_logs;
drop policy if exists "service_logs_select_portal" on public.service_logs;
drop policy if exists "service_logs_insert_portal" on public.service_logs;
drop policy if exists "service_logs_update_admin" on public.service_logs;
drop policy if exists "service_logs_delete_admin" on public.service_logs;

create policy "service_logs_select_portal"
  on public.service_logs for select
  to authenticated
  using (public.can_access_admin_portal());

create policy "service_logs_insert_portal"
  on public.service_logs for insert
  to authenticated
  with check (public.can_access_admin_portal());

create policy "service_logs_update_admin"
  on public.service_logs for update
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

create policy "service_logs_delete_admin"
  on public.service_logs for delete
  to authenticated
  using (public.is_salon_portal_admin());

-- suppliers (admin only — staff cannot read supplier financials)
drop policy if exists "salon_suppliers_staff" on public.suppliers;
drop policy if exists "suppliers_select_admin" on public.suppliers;
drop policy if exists "suppliers_write_admin" on public.suppliers;

create policy "suppliers_select_admin"
  on public.suppliers for select
  to authenticated
  using (public.is_salon_portal_admin());

create policy "suppliers_write_admin"
  on public.suppliers for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

-- purchases + lines (admin only)
drop policy if exists "salon_purchases_staff" on public.purchases;
drop policy if exists "salon_purchase_lines_staff" on public.purchase_lines;
drop policy if exists "purchases_admin_all" on public.purchases;
drop policy if exists "purchase_lines_admin_all" on public.purchase_lines;

create policy "purchases_admin_all"
  on public.purchases for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

create policy "purchase_lines_admin_all"
  on public.purchase_lines for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

-- weekly legacy worksheets (admin only — archived operational path)
drop policy if exists "weekly_reports_staff" on public.weekly_sales_reports;
drop policy if exists "weekly_product_sales_staff" on public.weekly_product_sales;
drop policy if exists "weekly_service_sales_staff" on public.weekly_service_sales;
drop policy if exists "weekly_space_staff" on public.weekly_stylist_space_payments;

drop policy if exists "weekly_reports_admin" on public.weekly_sales_reports;
drop policy if exists "weekly_product_sales_admin" on public.weekly_product_sales;
drop policy if exists "weekly_service_sales_admin" on public.weekly_service_sales;
drop policy if exists "weekly_space_admin" on public.weekly_stylist_space_payments;

create policy "weekly_reports_admin"
  on public.weekly_sales_reports for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

create policy "weekly_product_sales_admin"
  on public.weekly_product_sales for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

create policy "weekly_service_sales_admin"
  on public.weekly_service_sales for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());

create policy "weekly_space_admin"
  on public.weekly_stylist_space_payments for all
  to authenticated
  using (public.is_salon_portal_admin())
  with check (public.is_salon_portal_admin());
