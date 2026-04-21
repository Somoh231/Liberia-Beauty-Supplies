-- Seed catalog + opening stock from Nnaemeka Global Resources invoice summaries.
-- Idempotent: skips rows that already exist by stable sku (ngr-*).
-- Requires inventory platform migration (inventory_items, stock_movements, suppliers, inventory_categories).

do $$
declare
  v_supplier_id uuid;
  v_item_id uuid;
  r record;
begin
  select s.id
    into v_supplier_id
  from public.suppliers s
  where lower(trim(s.name)) = lower('Nnaemeka Global Resources')
  limit 1;

  if v_supplier_id is null then
    insert into public.suppliers (name, active)
    values ('Nnaemeka Global Resources', true)
    returning id into v_supplier_id;
  end if;

  for r in
    select *
    from (
      values
        -- Invoice-style hair / extensions (unit price ₦)
        ('ngr-hh-c16'::text, 'Human Hair curly 16"'::text, 'each'::text, 10::numeric, 9500::numeric, 'hair-scalp'::text),
        ('ngr-hh-c14', 'Human Hair curly 14"', 'each', 10, 15500, 'hair-scalp'),
        ('ngr-lily-twist-ly', 'Lily twist ly', 'each', 5, 4700, 'hair-scalp'),
        ('ngr-lady-twist', 'Lady twist', 'each', 5, 3900, 'hair-scalp'),
        ('ngr-soft-twist', 'Soft twist', 'each', 10, 4500, 'hair-scalp'),
        ('ngr-ceres-gabra', 'Ceres Gabra', 'each', 5, 4700, 'hair-scalp'),
        ('ngr-bony-curly', 'Bony curly', 'each', 10, 5000, 'hair-scalp'),
        ('ngr-natural-ly', 'Natural ly', 'each', 10, 4600, 'hair-scalp'),
        ('ngr-hawaiian', 'Hawaiian', 'each', 15, 7500, 'hair-scalp'),
        ('ngr-joke', 'Joke', 'each', 10, 4500, 'hair-scalp'),
        ('ngr-jumbo', 'Jumbo', 'each', 20, 5700, 'hair-scalp'),
        ('ngr-super-braid', 'Super braid', 'each', 15, 5600, 'hair-scalp'),
        ('ngr-way-braid', 'Way braid', 'each', 25, 4300, 'hair-scalp'),
        ('ngr-fantastic-twist', 'Fantastic twist', 'each', 20, 4300, 'hair-scalp'),
        ('ngr-bure-straight', 'Bure straight', 'each', 20, 4500, 'hair-scalp'),
        ('ngr-body-wave', 'Body wave', 'each', 25, 5000, 'hair-scalp'),
        -- Second invoice (beauty / equipment)
        ('ngr-lash-bed', 'Lash bed', 'each', 1, 90000, 'equipment'),
        ('ngr-spa-stool', 'Spa stool', 'each', 1, 45000, 'equipment'),
        ('ngr-lash-pillow', 'Lash pillow', 'each', 1, 10000, 'nails-beauty'),
        ('ngr-glove-black', 'Glove black', 'each', 1, 15000, 'nails-beauty'),
        ('ngr-mapping-pen-3in1', 'Mapping pen 3in1', 'each', 1, 20000, 'nails-beauty'),
        ('ngr-brow-stencil', 'Brow stencil', 'each', 3, 20000, 'nails-beauty'),
        ('ngr-sachet-ointment', 'Sachet ointment', 'each', 1, 12000, 'retail-supplies'),
        ('ngr-tag-45', 'Tag 45', 'each', 2, 14000, 'nails-beauty'),
        ('ngr-cling-film', 'Cling film', 'each', 4, 2000, 'retail-supplies'),
        ('ngr-tweezed-case', 'Tweezed case', 'each', 2, 2500, 'nails-beauty'),
        ('ngr-ba3-machine', 'BA3 machine', 'each', 2, 50000, 'equipment'),
        ('ngr-carts-ques-3p', 'Carts, ques 3P', 'each', 1, 80000, 'equipment'),
        ('ngr-bed-cover', 'Bed cover', 'each', 1, 10000, 'retail-supplies'),
        ('ngr-pigment-orange', 'Pigment orange', 'each', 1, 2000, 'nails-beauty'),
        ('ngr-mousse-shampoo', 'Mousse shampoo', 'each', 2, 3000, 'retail-supplies'),
        ('ngr-skin', 'Skin', 'each', 5, 3000, 'nails-beauty'),
        ('ngr-surgical-blade', 'Surgical blade', 'pack', 1, 45000, 'retail-supplies'),
        ('ngr-fano-e', 'Fano E', 'each', 3, 15000, 'nails-beauty'),
        ('ngr-lash-sticker', 'Lash sticker', 'each', 1, 5000, 'nails-beauty'),
        ('ngr-hp-brush-swap', 'HP brush / swap', 'each', 2, 1500, 'nails-beauty'),
        ('ngr-brow-booster', 'Brow booster', 'each', 3, 10000, 'nails-beauty'),
        ('ngr-pigment-blk-choc-dark', 'Pigment black/choc/dark', 'each', 4, 15000, 'nails-beauty')
    ) as t(sku, title, unit, opening_qty, unit_price_naira, cat_slug)
  loop
    if exists (select 1 from public.inventory_items i where i.sku = r.sku) then
      continue;
    end if;

    insert into public.inventory_items (
      name,
      sku,
      unit,
      reorder_point,
      unit_cost_cents,
      selling_price_cents,
      quantity_on_hand,
      active,
      supplier_id,
      category_id
    )
    values (
      r.title,
      r.sku,
      r.unit,
      5,
      (r.unit_price_naira * 100)::int,
      (r.unit_price_naira * 100)::int,
      0,
      true,
      v_supplier_id,
      (select c.id from public.inventory_categories c where c.slug = r.cat_slug limit 1)
    )
    returning id into v_item_id;

    insert into public.stock_movements (
      inventory_item_id,
      quantity_change,
      reason,
      notes
    )
    values (
      v_item_id,
      r.opening_qty,
      'initial',
      'Opening stock — Nnaemeka Global Resources invoice summary'
    );
  end loop;
end $$;
