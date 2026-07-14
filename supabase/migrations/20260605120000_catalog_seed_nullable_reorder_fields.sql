-- =============================================================================
-- Catalog seed: allow NULL reorder_level / reorder_point for needs_setup inserts.
-- Production still enforces NOT NULL on reorder_point (from original schema).
-- 20260602 made low_stock_threshold + avg_unit_cost_cents nullable but missed
-- reorder_level / reorder_point. Forward-only. No row updates. No fake defaults.
-- =============================================================================

-- Audit targets (as of prior migrations):
--   reorder_point       NOT NULL DEFAULT 0   (20260426 / 20260421)
--   reorder_level       nullable add-column  (may still be NOT NULL in some DBs)
--   low_stock_threshold nullable             (20260602)
--   avg_unit_cost_cents nullable             (20260602)

alter table public.inventory_items
  alter column reorder_level drop not null;

alter table public.inventory_items
  alter column reorder_point drop not null;

-- Idempotent: keep prior nullable operational fields (safe if already applied).
alter table public.inventory_items
  alter column low_stock_threshold drop not null;

alter table public.inventory_items
  alter column avg_unit_cost_cents drop not null;

comment on column public.inventory_items.reorder_level is
  'Reorder level. NULL while setup_status=needs_setup until manual product setup.';

comment on column public.inventory_items.reorder_point is
  'Reorder point. NULL while setup_status=needs_setup until manual product setup.';

-- Preserve trigger from 20260602: defaults only when setup_status is not needs_setup.
-- (Re-assert without behavior change so production has an explicit contract.)
create or replace function public.trg_inventory_items_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.product_code is null or trim(new.product_code) = '' then
      new.product_code := public.allocate_inventory_product_code();
    end if;
  end if;

  if new.product_name is null or trim(new.product_name) = '' then
    new.product_name := coalesce(nullif(trim(new.name), ''), 'Product');
  end if;

  new.name := new.product_name;

  -- Catalog seed / incomplete setup: leave reorder & low-stock unset.
  if coalesce(new.setup_status, 'ready') is distinct from 'needs_setup' then
    if new.reorder_level is null then
      new.reorder_level := coalesce(new.reorder_point, 5);
    end if;
    if new.reorder_point is null then
      new.reorder_point := new.reorder_level;
    end if;
    if new.low_stock_threshold is null then
      new.low_stock_threshold := coalesce(new.reorder_level, 5);
    end if;
  end if;

  return new;
end;
$$;

comment on function public.trg_inventory_items_before_write() is
  'Assigns product_code/name; applies reorder/low-stock defaults only when setup_status is not needs_setup.';
