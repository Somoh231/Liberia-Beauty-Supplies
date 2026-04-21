-- Purchase invoices: record supplier buys, line items, and post stock_movements with weighted average cost.

alter table public.inventory_items
  add column if not exists last_purchase_at timestamptz;

comment on column public.inventory_items.last_purchase_at is 'Most recent purchase receipt affecting this SKU (from purchase invoice or manual restock).';

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  supplier_name text not null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  total_amount_cents bigint not null default 0,
  currency text not null default 'NGN',
  purchase_date date not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint purchase_invoices_total_nonneg check (total_amount_cents >= 0),
  constraint purchase_invoices_invoice_supplier_unique unique (invoice_number, supplier_id)
);

comment on table public.purchase_invoices is 'Supplier purchase headers; amounts in minor units of currency (e.g. kobo for NGN).';

create index if not exists purchase_invoices_purchase_date_idx on public.purchase_invoices (purchase_date desc);
create index if not exists purchase_invoices_supplier_id_idx on public.purchase_invoices (supplier_id);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.purchase_invoices (id) on delete cascade,
  product_id uuid not null references public.inventory_items (id) on delete restrict,
  product_name text not null,
  qty numeric(14, 4) not null,
  unit_cost_cents int not null,
  line_total_cents bigint not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint purchase_items_qty_pos check (qty > 0),
  constraint purchase_items_unit_cost_nonneg check (unit_cost_cents >= 0),
  constraint purchase_items_line_total_nonneg check (line_total_cents >= 0)
);

comment on table public.purchase_items is 'Line items for a purchase invoice; product_id references inventory_items.';

create index if not exists purchase_items_invoice_id_idx on public.purchase_items (invoice_id);
create index if not exists purchase_items_product_id_idx on public.purchase_items (product_id);

alter table public.purchase_invoices enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "purchase_invoices_staff_all" on public.purchase_invoices;
create policy "purchase_invoices_staff_all"
  on public.purchase_invoices for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

drop policy if exists "purchase_items_staff_all" on public.purchase_items;
create policy "purchase_items_staff_all"
  on public.purchase_items for all
  to authenticated
  using (public.is_staff_user())
  with check (public.is_staff_user());

-- Atomically commit invoice: resolve/create supplier, insert invoice + lines, post purchases, weighted avg cost.
create or replace function public.commit_purchase_invoice(p_invoice jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv_id uuid;
  v_supplier_id uuid;
  v_supplier_name text := trim(both from coalesce(p_invoice->>'supplier_name', ''));
  v_inv_no text := trim(both from coalesce(p_invoice->>'invoice_number', ''));
  v_pdate date;
  v_currency text := coalesce(nullif(trim(both from coalesce(p_invoice->>'currency', '')), ''), 'NGN');
  v_lines jsonb := p_invoice->'lines';
  v_line jsonb;
  v_total bigint := 0;
  v_name text;
  v_qty numeric(14, 4);
  v_uc int;
  v_lt bigint;
  v_pid uuid;
  v_q0 numeric(14, 4);
  v_c0 int;
  v_new_qty numeric(14, 4);
  v_new_cost int;
  v_sort int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not public.can_access_admin_portal() then
    raise exception 'forbidden';
  end if;

  if length(v_supplier_name) < 2 then
    raise exception 'invalid_supplier_name';
  end if;

  if length(v_inv_no) < 1 then
    raise exception 'invalid_invoice_number';
  end if;

  begin
    v_pdate := (p_invoice->>'purchase_date')::date;
  exception when others then
    raise exception 'invalid_purchase_date';
  end;

  if v_lines is null or jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'no_lines';
  end if;

  select coalesce(sum((e->>'line_total_cents')::bigint), 0)
    into v_total
  from jsonb_array_elements(v_lines) as e;

  select s.id
    into v_supplier_id
  from public.suppliers s
  where lower(trim(s.name)) = lower(v_supplier_name)
  limit 1;

  if v_supplier_id is null then
    insert into public.suppliers (name, active)
    values (v_supplier_name, true)
    returning id into v_supplier_id;
  end if;

  if exists (
    select 1
    from public.purchase_invoices pi
    where pi.invoice_number = v_inv_no
      and pi.supplier_id = v_supplier_id
  ) then
    raise exception 'duplicate_invoice';
  end if;

  insert into public.purchase_invoices (
    invoice_number,
    supplier_name,
    supplier_id,
    total_amount_cents,
    currency,
    purchase_date,
    created_by
  )
  values (
    v_inv_no,
    v_supplier_name,
    v_supplier_id,
    v_total,
    v_currency,
    v_pdate,
    v_uid
  )
  returning id into v_inv_id;

  for v_line in select jsonb_array_elements(v_lines)
  loop
    v_sort := v_sort + 1;
    v_name := trim(both from coalesce(v_line->>'product_name', ''));
    begin
      v_qty := (v_line->>'qty')::numeric(14, 4);
    exception when others then
      raise exception 'invalid_qty';
    end;
    begin
      v_uc := (v_line->>'unit_cost_cents')::int;
      v_lt := (v_line->>'line_total_cents')::bigint;
    exception when others then
      raise exception 'invalid_money';
    end;

    if length(v_name) < 1 then
      raise exception 'invalid_product_name';
    end if;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_qty';
    end if;

    if v_uc < 0 or v_lt < 0 then
      raise exception 'invalid_money';
    end if;

    select i.id
      into v_pid
    from public.inventory_items i
    where lower(trim(i.name)) = lower(v_name)
      and i.active = true
    order by i.created_at asc
    limit 1;

    if v_pid is null then
      insert into public.inventory_items (
        name,
        unit,
        reorder_point,
        quantity_on_hand,
        active,
        supplier_id,
        unit_cost_cents
      )
      values (
        v_name,
        'each',
        5,
        0,
        true,
        v_supplier_id,
        null
      )
      returning id into v_pid;
    end if;

    insert into public.purchase_items (
      invoice_id,
      product_id,
      product_name,
      qty,
      unit_cost_cents,
      line_total_cents,
      sort_order
    )
    values (
      v_inv_id,
      v_pid,
      v_name,
      v_qty,
      v_uc,
      v_lt,
      v_sort
    );

    select i.quantity_on_hand, i.unit_cost_cents
      into strict v_q0, v_c0
    from public.inventory_items i
    where i.id = v_pid
    for update;

    v_new_qty := v_q0 + v_qty;

    if v_new_qty > 0 then
      v_new_cost := round(
        (coalesce(v_c0, v_uc)::numeric * v_q0 + v_uc::numeric * v_qty) / v_new_qty
      )::int;
    else
      v_new_cost := v_uc;
    end if;

    insert into public.stock_movements (
      inventory_item_id,
      quantity_change,
      reason,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      v_pid,
      v_qty,
      'purchase',
      'purchase_invoice',
      v_inv_id,
      format('Invoice %s — %s', v_inv_no, v_supplier_name),
      v_uid
    );

    update public.inventory_items i
    set
      unit_cost_cents = v_new_cost,
      last_purchase_at = now(),
      supplier_id = coalesce(i.supplier_id, v_supplier_id),
      updated_at = now()
    where i.id = v_pid;
  end loop;

  return v_inv_id;
end;
$$;

comment on function public.commit_purchase_invoice(jsonb) is 'Creates purchase invoice + items, posts purchase stock_movements, updates weighted unit_cost_cents and last_purchase_at.';

revoke all on function public.commit_purchase_invoice(jsonb) from public;
grant execute on function public.commit_purchase_invoice(jsonb) to authenticated;
