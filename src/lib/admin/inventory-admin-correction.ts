import type { InventoryProductRow } from "@/lib/admin/salon-queries";

export type InventoryMovementType = "manual_adjustment" | "correction" | "damaged" | "expired";

export type InventoryAdminCorrectionInput = {
  productName: string;
  sku?: string | null;
  unit?: string | null;
  supplierId?: string | null;
  category?: string | null;
  notes?: string | null;
  reorderLevel: number | null;
  lowStockThreshold: number | null;
  quantityOnHand: number;
  avgUnitCostCents: number | null;
  costCurrency: string;
  defaultUnitPriceCents: number | null;
  defaultPriceCurrency: string;
  fxNgnPerUsd: number | null;
  landedUsdCentsPerUnit: number;
  storePriceUsdCents: number | null;
  sellPriceUsdCents: number | null;
  sellPriceLrdCents: number | null;
  weightedAvgLandedUsdCents: number | null;
  active: boolean;
  archived: boolean;
  isAddon: boolean;
  auditReason: string;
  movementType: InventoryMovementType;
};

export type InventoryMaterialChangeFlags = {
  quantity: boolean;
  pricing: boolean;
  status: boolean;
  any: boolean;
};

function numEq(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

/** Detect qty, pricing, or archive/active changes vs existing row. */
export function detectInventoryMaterialChanges(
  existing: InventoryProductRow,
  next: InventoryAdminCorrectionInput,
): InventoryMaterialChangeFlags {
  const quantity = !numEq(existing.quantity_on_hand, next.quantityOnHand);
  const pricing =
    existing.avg_unit_cost_cents !== next.avgUnitCostCents ||
    existing.cost_currency !== next.costCurrency ||
    existing.default_unit_price_cents !== next.defaultUnitPriceCents ||
    existing.default_price_currency !== next.defaultPriceCurrency ||
    !numEq(existing.fx_ngn_per_usd ?? null, next.fxNgnPerUsd) ||
    (existing.landed_usd_cents_per_unit ?? 0) !== next.landedUsdCentsPerUnit ||
    existing.store_price_usd_cents !== next.storePriceUsdCents ||
    existing.sell_price_usd_cents !== next.sellPriceUsdCents ||
    existing.sell_price_lrd_cents !== next.sellPriceLrdCents ||
    (existing.weighted_avg_landed_usd_cents ?? 0) !== (next.weightedAvgLandedUsdCents ?? 0);
  const archivedBefore = existing.deleted_at != null;
  const status = existing.active !== next.active || archivedBefore !== next.archived;
  return { quantity, pricing, status, any: quantity || pricing || status };
}

export function buildAdminCorrectionRpcPayload(
  inventoryItemId: string,
  next: InventoryAdminCorrectionInput,
): Record<string, unknown> {
  return {
    inventory_item_id: inventoryItemId,
    product_name: next.productName,
    sku: next.sku ?? null,
    unit: next.unit ?? "each",
    supplier_id: next.supplierId ?? null,
    category: next.category ?? null,
    notes: next.notes ?? null,
    reorder_level: next.reorderLevel,
    low_stock_threshold: next.lowStockThreshold,
    quantity_on_hand: next.quantityOnHand,
    avg_unit_cost_cents: next.avgUnitCostCents,
    cost_currency: next.costCurrency,
    default_unit_price_cents: next.defaultUnitPriceCents,
    default_price_currency: next.defaultPriceCurrency,
    fx_ngn_per_usd: next.fxNgnPerUsd,
    landed_usd_cents_per_unit: next.landedUsdCentsPerUnit,
    store_price_usd_cents: next.storePriceUsdCents,
    sell_price_usd_cents: next.sellPriceUsdCents,
    sell_price_lrd_cents: next.sellPriceLrdCents,
    weighted_avg_landed_usd_cents: next.weightedAvgLandedUsdCents,
    active: next.active,
    archived: next.archived,
    is_addon: next.isAddon,
    audit_reason: next.auditReason,
    movement_type: next.movementType,
  };
}
