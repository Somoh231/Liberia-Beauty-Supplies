/**
 * Category-first inventory: workbook worksheets ↔ inventory_items.category text.
 * No separate categories table — categories are created/reused via catalog seed.
 */

import {
  EXPECTED_CATALOG_PRODUCT_COUNTS,
  EXPECTED_IMPORT_CATEGORIES,
} from "@/lib/admin/inventory-import/types";
import type { InventoryProductRow } from "@/lib/admin/salon-queries";
import {
  hasInventoryCostBasis,
  hasInventoryRetailPrice,
  inventoryNeedsSetup,
  isInventoryAsset,
} from "@/lib/admin/inventory-sellability";

export const WORKBOOK_CATALOG_CATEGORIES = EXPECTED_IMPORT_CATEGORIES;
export type WorkbookCatalogCategory = (typeof EXPECTED_IMPORT_CATEGORIES)[number];

/** Exact approved inventory category allowlist (workbook sheets). */
export const APPROVED_INVENTORY_CATEGORIES = EXPECTED_IMPORT_CATEGORIES;

/** URL segment for /admin/inventory/categories/[categorySlug] */
export function inventoryCategoryToSlug(category: string): string {
  return encodeURIComponent(category.trim());
}

/**
 * Resolve a route slug to a canonical approved category name.
 * Unknown or empty slugs return null (caller should 404).
 */
export function inventoryCategoryFromSlug(slug: string): string | null {
  const raw = typeof slug === "string" ? slug.trim() : "";
  if (!raw) return null;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw).trim();
  } catch {
    decoded = raw;
  }
  if (!decoded) return null;

  for (const cat of APPROVED_INVENTORY_CATEGORIES) {
    if (cat === decoded) return cat;
    if (inventoryCategoryToSlug(cat) === raw) return cat;
  }
  return null;
}

export function isWorkbookCatalogCategory(name: string): name is WorkbookCatalogCategory {
  return (EXPECTED_IMPORT_CATEGORIES as readonly string[]).includes(name.trim());
}

export type InventoryCategorySummary = {
  category: string;
  slug: string;
  totalProducts: number;
  needsSetupCount: number;
  readyCount: number;
  assetCount: number;
  expectedWorkbookCount: number | null;
};

export function summarizeInventoryByCategory(
  rows: Pick<InventoryProductRow, "category" | "setup_status" | "item_type">[],
): InventoryCategorySummary[] {
  const map = new Map<
    string,
    { total: number; needsSetup: number; ready: number; assets: number }
  >();

  for (const cat of EXPECTED_IMPORT_CATEGORIES) {
    map.set(cat, { total: 0, needsSetup: 0, ready: 0, assets: 0 });
  }

  for (const row of rows) {
    const cat = (row.category ?? "").trim() || "Uncategorized";
    if (!map.has(cat)) map.set(cat, { total: 0, needsSetup: 0, ready: 0, assets: 0 });
    const bucket = map.get(cat)!;
    bucket.total += 1;
    if (row.item_type === "asset") bucket.assets += 1;
    if (inventoryNeedsSetup(row) || row.setup_status === "needs_setup") bucket.needsSetup += 1;
    else bucket.ready += 1;
  }

  // Prefer workbook order, then any extra categories alphabetically.
  const orderedNames = [
    ...EXPECTED_IMPORT_CATEGORIES,
    ...[...map.keys()].filter((k) => !(EXPECTED_IMPORT_CATEGORIES as readonly string[]).includes(k)).sort(),
  ];

  return orderedNames.map((category) => {
    const b = map.get(category) ?? { total: 0, needsSetup: 0, ready: 0, assets: 0 };
    const expected =
      category in EXPECTED_CATALOG_PRODUCT_COUNTS
        ? EXPECTED_CATALOG_PRODUCT_COUNTS[category as keyof typeof EXPECTED_CATALOG_PRODUCT_COUNTS]
        : null;
    return {
      category,
      slug: inventoryCategoryToSlug(category),
      totalProducts: b.total,
      needsSetupCount: b.needsSetup,
      readyCount: b.ready,
      assetCount: b.assets,
      expectedWorkbookCount: expected,
    };
  });
}

export function productsInCategory(
  rows: InventoryProductRow[],
  category: string,
): InventoryProductRow[] {
  const target = category.trim().toLowerCase();
  return rows.filter((r) => (r.category ?? "").trim().toLowerCase() === target);
}

/** Display helper — never show a misleading $0 when the field is unset / catalog-empty. */
export function formatUnsetMoney(
  cents: number | null | undefined,
  opts?: { treatZeroAsUnset?: boolean },
): string | null {
  if (cents == null) return null;
  if (opts?.treatZeroAsUnset && cents === 0) return null;
  return String(cents);
}

export function displayMoneyOrNotSet(
  cents: number | null | undefined,
  format: (cents: number) => string,
  opts?: { treatZeroAsUnset?: boolean; needsSetup?: boolean },
): string {
  if (cents == null) return "Not set";
  if ((opts?.needsSetup || opts?.treatZeroAsUnset) && cents === 0) return "Not set";
  return format(cents);
}

export type InventorySetupChecklistItem = {
  key: string;
  label: string;
  complete: boolean;
  required: boolean;
};

export function buildInventorySetupChecklist(item: {
  item_type?: string | null;
  quantity_on_hand?: number | null;
  supplier_id?: string | null;
  avg_unit_cost_cents?: number | null;
  weighted_avg_landed_usd_cents?: number | null;
  landed_usd_cents_per_unit?: number | null;
  sell_price_usd_cents?: number | null;
  sell_price_lrd_cents?: number | null;
  store_price_usd_cents?: number | null;
  reorder_level?: number | null;
  low_stock_threshold?: number | null;
}): InventorySetupChecklistItem[] {
  if (isInventoryAsset(item)) {
    return [
      { key: "asset", label: "Asset (no retail setup required)", complete: true, required: true },
    ];
  }
  return [
    {
      key: "supplier",
      label: "Supplier",
      complete: !!item.supplier_id,
      required: true,
    },
    {
      key: "cost",
      label: "Unit cost / WAC",
      complete: hasInventoryCostBasis(item),
      required: true,
    },
    {
      key: "retail",
      label: "Retail / sell price",
      complete: hasInventoryRetailPrice(item),
      required: true,
    },
    {
      key: "qty",
      label: "Quantity on hand",
      complete: item.quantity_on_hand != null,
      required: true,
    },
    {
      key: "reorder",
      label: "Reorder level",
      complete: item.reorder_level != null,
      required: false,
    },
    {
      key: "low_stock",
      label: "Low-stock threshold",
      complete: item.low_stock_threshold != null,
      required: false,
    },
  ];
}

export function catalogSeedFinancialFieldsUnset(payload: {
  quantity: number;
  retail_ngn_cents: number | null;
  sell_usd_cents: number | null;
  sell_lrd_cents: number | null;
  setup_status?: string;
}): boolean {
  return (
    payload.quantity === 0 &&
    payload.retail_ngn_cents == null &&
    payload.sell_usd_cents == null &&
    payload.sell_lrd_cents == null &&
    payload.setup_status === "needs_setup"
  );
}
