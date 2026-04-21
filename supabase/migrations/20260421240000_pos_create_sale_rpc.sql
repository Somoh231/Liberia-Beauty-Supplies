-- Atomic POS checkout: sale + sale_items + stock_movements (retail) in one transaction.
create or replace function public.create_pos_sale(
  p_payment_method text,
  p_customer_id uuid,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_line jsonb;
  v_i int;
  v_len int;
  v_sort int := 0;
  v_subtotal bigint := 0;
  v_name text;
  v_qty numeric;
  v_unit int;
  v_line_total int;
  v_sid uuid;
  v_iid uuid;
  v_calc bigint;
  v_qty_on_hand numeric;
  v_svc_price int;
  v_inv_sell int;
  v_inv_cost int;
  v_pm text;
begin
  if not public.is_staff_user() then
    raise exception 'forbidden' using errcode = '28000';
  end if;

  v_pm := lower(trim(coalesce(p_payment_method, '')));
  if v_pm not in ('cash', 'mobile_money', 'transfer') then
    raise exception 'invalid_payment' using errcode = '22000';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'no_lines' using errcode = '22000';
  end if;

  if p_customer_id is not null then
    if not exists (select 1 from customers where id = p_customer_id) then
      raise exception 'bad_customer' using errcode = '22000';
    end if;
  end if;

  v_len := jsonb_array_length(p_lines);
  for v_i in 0 .. v_len - 1 loop
    v_line := p_lines->v_i;
    v_name := coalesce(trim(v_line->>'name'), '');
    if length(v_name) < 1 then
      raise exception 'bad_name' using errcode = '22000';
    end if;

    v_qty := (v_line->>'quantity')::numeric;
    v_unit := (v_line->>'unit_price_cents')::int;
    v_line_total := (v_line->>'line_total_cents')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'bad_qty' using errcode = '22000';
    end if;
    if v_unit < 0 or v_line_total < 0 then
      raise exception 'bad_price' using errcode = '22000';
    end if;

    v_calc := round(v_qty * v_unit::numeric)::bigint;
    if abs(v_line_total - v_calc) > 1 then
      raise exception 'total_mismatch' using errcode = '22000';
    end if;

    v_sid := null;
    v_iid := null;
    if (v_line ? 'service_id') and nullif(trim(v_line->>'service_id'), '') is not null then
      v_sid := (v_line->>'service_id')::uuid;
    end if;
    if (v_line ? 'inventory_item_id') and nullif(trim(v_line->>'inventory_item_id'), '') is not null then
      v_iid := (v_line->>'inventory_item_id')::uuid;
    end if;

    if v_sid is not null and v_iid is not null then
      raise exception 'amb_line' using errcode = '22000';
    end if;

    if v_sid is not null then
      select coalesce(price_cents, 0) into v_svc_price
      from services
      where id = v_sid and active = true;
      if not found then
        raise exception 'bad_service' using errcode = '22000';
      end if;
      if v_svc_price > 0 and v_unit > v_svc_price then
        raise exception 'service_price' using errcode = '22000';
      end if;
    end if;

    if v_iid is not null then
      select quantity_on_hand,
             coalesce(selling_price_cents, 0),
             coalesce(unit_cost_cents, 0)
      into v_qty_on_hand, v_inv_sell, v_inv_cost
      from inventory_items
      where id = v_iid and active = true
      for update;
      if not found then
        raise exception 'bad_item' using errcode = '22000';
      end if;
      if v_qty_on_hand < v_qty then
        raise exception 'insufficient_stock' using errcode = 'P0001';
      end if;
      if greatest(v_inv_sell, v_inv_cost) > 0 and v_unit > greatest(v_inv_sell, v_inv_cost) * 2 then
        raise exception 'item_price' using errcode = '22000';
      end if;
    end if;

    v_subtotal := v_subtotal + v_line_total;
  end loop;

  insert into sales (
    customer_id,
    status,
    subtotal_cents,
    tax_cents,
    total_cents,
    currency,
    payment_method,
    notes,
    created_by
  ) values (
    p_customer_id,
    'completed',
    v_subtotal::int,
    0,
    v_subtotal::int,
    'LRD',
    v_pm,
    nullif(trim(p_notes), ''),
    auth.uid()
  )
  returning id into v_sale_id;

  v_sort := 0;
  for v_i in 0 .. v_len - 1 loop
    v_line := p_lines->v_i;
    v_name := trim(v_line->>'name');
    v_qty := (v_line->>'quantity')::numeric;
    v_unit := (v_line->>'unit_price_cents')::int;
    v_line_total := (v_line->>'line_total_cents')::int;
    v_sid := null;
    v_iid := null;
    if (v_line ? 'service_id') and nullif(trim(v_line->>'service_id'), '') is not null then
      v_sid := (v_line->>'service_id')::uuid;
    end if;
    if (v_line ? 'inventory_item_id') and nullif(trim(v_line->>'inventory_item_id'), '') is not null then
      v_iid := (v_line->>'inventory_item_id')::uuid;
    end if;

    insert into sale_items (sale_id, inventory_item_id, name, quantity, unit_price_cents, line_total_cents, sort_order)
    values (v_sale_id, v_iid, v_name, v_qty, v_unit, v_line_total, v_sort);
    v_sort := v_sort + 1;

    if v_iid is not null then
      insert into stock_movements (
        inventory_item_id,
        quantity_change,
        reason,
        reference_type,
        reference_id,
        notes,
        created_by
      ) values (
        v_iid,
        -v_qty,
        'sale',
        'sale',
        v_sale_id,
        'POS sale',
        auth.uid()
      );
    end if;
  end loop;

  return v_sale_id;
end;
$$;

comment on function public.create_pos_sale is 'Staff POS: completed sale, line items, and inventory deductions in one transaction.';

revoke all on function public.create_pos_sale(text, uuid, text, jsonb) from public;
grant execute on function public.create_pos_sale(text, uuid, text, jsonb) to authenticated;
