import type { InventoryProductRow } from "@/lib/admin/salon-queries";
import type { SalonCurrency } from "@/lib/admin/salon-format";

/** Liberian dollars per 1 USD (e.g. 190 → $1 = LD 190). */
export function getLrdPerUsd(): number {
  const raw = process.env.SALON_LRD_PER_USD ?? process.env.NEXT_PUBLIC_SALON_LRD_PER_USD;
  const n = raw != null && raw !== "" ? Number(raw) : 190;
  if (!Number.isFinite(n) || n <= 0) return 190;
  return n;
}

/** NGN per 1 USD fallback when item has no FX stored. */
export function getDefaultNgnPerUsd(): number {
  const raw = process.env.SALON_NGN_PER_USD ?? process.env.NEXT_PUBLIC_SALON_NGN_PER_USD;
  const n = raw != null && raw !== "" ? Number(raw) : 1550;
  if (!Number.isFinite(n) || n <= 0) return 1550;
  return n;
}

export function ngnKoboToUsdCents(ngnKobo: number, ngnPerUsd: number): number {
  if (!Number.isFinite(ngnKobo) || ngnKobo < 0) return 0;
  if (!Number.isFinite(ngnPerUsd) || ngnPerUsd <= 0) return 0;
  return Math.round(ngnKobo / ngnPerUsd);
}

/** Canonical weighted-average landed unit cost in USD cents. */
export function effectiveUnitCostUsdCents(item: InventoryProductRow): number {
  const wac = item.weighted_avg_landed_usd_cents;
  if (wac != null && wac > 0) return wac;

  const landed = item.landed_usd_cents_per_unit ?? 0;
  if (item.cost_currency === "USD") {
    return Math.max(0, Math.round(item.avg_unit_cost_cents) + landed);
  }
  if (item.cost_currency === "NGN") {
    const fx = item.fx_ngn_per_usd != null && item.fx_ngn_per_usd > 0 ? Number(item.fx_ngn_per_usd) : getDefaultNgnPerUsd();
    const usd = ngnKoboToUsdCents(item.avg_unit_cost_cents, fx);
    return usd + landed;
  }
  if (item.cost_currency === "LRD") {
    const perUsd = getLrdPerUsd();
    const usd = Math.round(item.avg_unit_cost_cents / perUsd);
    return usd + landed;
  }
  return landed;
}

export function inventoryValueUsdCents(item: InventoryProductRow): number {
  const q = Number(item.quantity_on_hand);
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.round(q * effectiveUnitCostUsdCents(item));
}

/** Per-unit gross profit in USD (sell price USD − landed WAC USD). */
export function unitGrossProfitUsdCents(item: InventoryProductRow): number | null {
  const sell = item.sell_price_usd_cents;
  if (sell == null || sell <= 0) return null;
  const cost = effectiveUnitCostUsdCents(item);
  return sell - cost;
}

/** @deprecated use unitGrossProfitUsdCents */
export const unitNetProfitUsdCents = unitGrossProfitUsdCents;

export function unitGrossMarginPct(item: InventoryProductRow): number | null {
  const sell = item.sell_price_usd_cents;
  if (sell == null || sell <= 0) return null;
  const p = unitGrossProfitUsdCents(item);
  if (p == null) return null;
  return (p / sell) * 100;
}

/** Convert minor units in `currency` to USD cents for a single unit price × qty. */
export function lineRevenueUsdEquivCents(unitPriceMinor: number, qty: number, currency: SalonCurrency): number {
  const line = Math.round(qty * unitPriceMinor);
  if (currency === "USD") return line;
  if (currency === "LRD") {
    const perUsd = getLrdPerUsd();
    return Math.round(line / perUsd);
  }
  if (currency === "NGN") {
    const perUsd = getDefaultNgnPerUsd();
    return Math.round(line / perUsd);
  }
  return line;
}

export const SERVICE_CATEGORY_OPTIONS = [
  "Braids and waving",
  "Manicure",
  "Pedicure",
  "Micro Blading",
  "Photo shoot",
  "Barber",
  "Wig sewing",
  "Others",
] as const;

export type ServiceCategoryOption = (typeof SERVICE_CATEGORY_OPTIONS)[number];
