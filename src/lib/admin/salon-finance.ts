import type { InventoryProductRow } from "@/lib/admin/salon-queries";
import type { InventoryCostingInput } from "@/lib/admin/pricing-engine";
import {
  effectiveUnitCostUsdCents as effectiveUnitCostUsdCentsCore,
  inventoryValueUsdCents as inventoryValueUsdCentsCore,
  unitGrossMarginPct as unitGrossMarginPctCore,
  unitGrossProfitUsdCents as unitGrossProfitUsdCentsCore,
} from "@/lib/admin/pricing-engine";

export {
  complementaryRetailLabel,
  convertLrdCentsToUsdCents,
  convertRetailUnitMajorOnCurrencySwitch,
  convertUsdCentsToLrdCents,
  DEFAULT_OPERATIONAL_LRD_PER_USD,
  DEFAULT_OPERATIONAL_NGN_PER_USD,
  getDefaultNgnPerUsd,
  getLrdPerUsd,
  getOperationalFx,
  lineRevenueUsdEquivCents,
  ngnKoboToUsdCents,
  resolveOperationalFxFromSettings,
  saleLineFinancialPreview,
} from "@/lib/admin/pricing-engine";

export type { InventoryCostingInput } from "@/lib/admin/pricing-engine";

function asCosting(item: InventoryProductRow): InventoryCostingInput {
  return item;
}

/** Canonical weighted-average landed unit cost in USD cents. */
export function effectiveUnitCostUsdCents(item: InventoryProductRow): number {
  return effectiveUnitCostUsdCentsCore(asCosting(item));
}

export function inventoryValueUsdCents(item: InventoryProductRow): number {
  return inventoryValueUsdCentsCore(asCosting(item));
}

/** Per-unit gross profit in USD (sell price USD − landed WAC USD). */
export function unitGrossProfitUsdCents(item: InventoryProductRow): number | null {
  return unitGrossProfitUsdCentsCore(asCosting(item));
}

/** @deprecated use unitGrossProfitUsdCents */
export const unitNetProfitUsdCents = unitGrossProfitUsdCents;

export function unitGrossMarginPct(item: InventoryProductRow): number | null {
  return unitGrossMarginPctCore(asCosting(item));
}

export const SERVICE_CATEGORY_OPTIONS = [
  "Braids and waving",
  "Manicure",
  "Pedicure",
  "Micro Blading",
  "Make-up",
  "Lashes",
  "Photo shoot",
  "Barber",
  "Wig sewing",
  "Others",
] as const;

export type ServiceCategoryOption = (typeof SERVICE_CATEGORY_OPTIONS)[number];
