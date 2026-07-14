/** Inventory item_type / setup_status / sellability helpers (app + tests). */

export type InventoryItemType = "retail" | "asset";
export type InventorySetupStatus = "needs_setup" | "ready";

/** Fixed assets — trimmed, case-insensitive exact match (+ Industrial Machine prefix). */
export const INVENTORY_ASSET_PRODUCT_NAMES = [
  "Makeup Chair",
  "Lash Bed",
  "Spa Stool",
  "Pink Nail Table",
  "Customer Chair",
  "Nail Tech Chair",
  "Pedicure Chair",
  "Trolley",
  "Nail Light",
  "Hand Rest",
  "LED Light",
  "Industrial Machine",
] as const;

const ASSET_NAME_SET = new Set(INVENTORY_ASSET_PRODUCT_NAMES.map((n) => n.trim().toLowerCase()));

export function isInventoryAssetProductName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  if (ASSET_NAME_SET.has(n)) return true;
  return n.startsWith("industrial machine");
}

export function resolveCatalogItemType(productName: string): InventoryItemType {
  return isInventoryAssetProductName(productName) ? "asset" : "retail";
}

export type InventorySetupFields = {
  item_type?: InventoryItemType | string | null;
  quantity_on_hand?: number | null;
  supplier_id?: string | null;
  avg_unit_cost_cents?: number | null;
  weighted_avg_landed_usd_cents?: number | null;
  landed_usd_cents_per_unit?: number | null;
  sell_price_usd_cents?: number | null;
  sell_price_lrd_cents?: number | null;
  store_price_usd_cents?: number | null;
  setup_status?: InventorySetupStatus | string | null;
};

export function hasInventoryCostBasis(item: InventorySetupFields): boolean {
  return (
    Number(item.weighted_avg_landed_usd_cents ?? 0) > 0 ||
    Number(item.avg_unit_cost_cents ?? 0) > 0 ||
    Number(item.landed_usd_cents_per_unit ?? 0) > 0
  );
}

export function hasInventoryRetailPrice(item: InventorySetupFields): boolean {
  return (
    Number(item.sell_price_usd_cents ?? 0) > 0 ||
    Number(item.sell_price_lrd_cents ?? 0) > 0 ||
    Number(item.store_price_usd_cents ?? 0) > 0
  );
}

export function isRetailSetupComplete(item: InventorySetupFields): boolean {
  return (
    item.quantity_on_hand != null &&
    !!item.supplier_id &&
    hasInventoryCostBasis(item) &&
    hasInventoryRetailPrice(item)
  );
}

/** Persistable setup_status — assets ready; retail only when complete. */
export function deriveInventorySetupStatus(item: InventorySetupFields): InventorySetupStatus {
  if ((item.item_type ?? "retail") === "asset") return "ready";
  return isRetailSetupComplete(item) ? "ready" : "needs_setup";
}

/**
 * Prefer persisted setup_status when present; otherwise derive (backward-compatible).
 */
export function inventoryNeedsSetup(item: InventorySetupFields): boolean {
  if (item.setup_status === "needs_setup") return true;
  if (item.setup_status === "ready") return false;
  if ((item.item_type ?? "retail") === "asset") return false;
  return !isRetailSetupComplete(item);
}

export function isInventoryAsset(item: { item_type?: string | null }): boolean {
  return item.item_type === "asset";
}

/** Sale typeahead / POS eligibility (UI filter — server guard is authoritative). */
export function isSellableForSaleSearch(item: {
  active?: boolean | null;
  deleted_at?: string | null;
  item_type?: string | null;
  setup_status?: string | null;
  sell_price_usd_cents?: number | null;
  sell_price_lrd_cents?: number | null;
  store_price_usd_cents?: number | null;
}): boolean {
  if (item.deleted_at) return false;
  if (item.active === false) return false;
  if (item.item_type === "asset") return false;
  if (item.setup_status === "needs_setup") return false;
  if (item.setup_status !== "ready" && inventoryNeedsSetup(item)) return false;
  return hasInventoryRetailPrice(item);
}

export function filterSellableInventoryItems<T extends Parameters<typeof isSellableForSaleSearch>[0]>(
  items: T[],
): T[] {
  return items.filter(isSellableForSaleSearch);
}

/** Map DB/RPC exception text to stable client error codes. */
export function mapInventorySaleGuardError(message: string, code?: string): string | null {
  const msg = (message ?? "").toLowerCase();
  if (code === "PGRST202") return null;
  if (msg.includes("product_needs_setup")) return "product_needs_setup";
  if (msg.includes("product_not_sellable")) return "product_not_sellable";
  if (msg.includes("product_missing_retail_price")) return "product_missing_retail_price";
  return null;
}

export type InventorySetupProgress = {
  needsSetupCount: number;
  totalProducts: number;
  assetCount: number;
  readyRetailCount: number;
};

export function summarizeInventorySetupProgress(
  items: { item_type?: string | null; setup_status?: string | null; deleted_at?: string | null }[],
): InventorySetupProgress {
  const live = items.filter((i) => !i.deleted_at);
  return {
    totalProducts: live.length,
    needsSetupCount: live.filter((i) => i.setup_status === "needs_setup").length,
    assetCount: live.filter((i) => i.item_type === "asset").length,
    readyRetailCount: live.filter((i) => i.item_type !== "asset" && i.setup_status === "ready").length,
  };
}
