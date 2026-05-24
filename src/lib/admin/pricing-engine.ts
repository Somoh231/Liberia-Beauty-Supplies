/**
 * Central operational FX and pricing math for inventory, purchases, sales, and reporting.
 * All modules should use this module (directly or via `salon-finance` re-exports) — do not duplicate FX.
 */

import type { SalonCurrency } from "@/lib/admin/salon-format";
import { parseMoneyToCents } from "@/lib/admin/salon-format";

/** Minimal row shape for costing — avoids circular imports with `salon-queries`. */
export type InventoryCostingInput = {
  avg_unit_cost_cents: number;
  cost_currency: SalonCurrency;
  landed_usd_cents_per_unit?: number;
  fx_ngn_per_usd?: number | null;
  weighted_avg_landed_usd_cents?: number | null;
  sell_price_usd_cents?: number | null;
  sell_price_lrd_cents?: number | null;
  quantity_on_hand?: number;
  store_price_usd_cents?: number | null;
};

/** Official operational NGN/USD baseline — used when `operational_settings.ngn_per_usd` is unset. */
export const DEFAULT_OPERATIONAL_NGN_PER_USD = 1385;
export const DEFAULT_OPERATIONAL_LRD_PER_USD = 190;

export type OperationalFxRates = {
  /** NGN per 1 USD (major), e.g. 1385 */
  ngnPerUsd: number;
  /** Liberian dollars per 1 USD (major), e.g. 190 */
  lrdPerUsd: number;
};

/** Env override optional; otherwise official baseline (1385 / 190). */
export function getOperationalFx(): OperationalFxRates {
  const rawNgn = process.env.SALON_NGN_PER_USD ?? process.env.NEXT_PUBLIC_SALON_NGN_PER_USD;
  let ngn = DEFAULT_OPERATIONAL_NGN_PER_USD;
  if (rawNgn != null && rawNgn !== "") {
    const parsed = Number(rawNgn);
    if (Number.isFinite(parsed) && parsed > 0) ngn = parsed;
  }
  const rawLrd = process.env.SALON_LRD_PER_USD ?? process.env.NEXT_PUBLIC_SALON_LRD_PER_USD;
  let lrd = DEFAULT_OPERATIONAL_LRD_PER_USD;
  if (rawLrd != null && rawLrd !== "") {
    const parsed = Number(rawLrd);
    if (Number.isFinite(parsed) && parsed > 0) lrd = parsed;
  }
  return { ngnPerUsd: ngn, lrdPerUsd: lrd };
}

/** DB settings win; otherwise official baseline (not env). */
export function resolveOperationalFxFromSettings(row: {
  ngn_per_usd: number | string | null;
  lrd_per_usd: number | string | null;
} | null): OperationalFxRates {
  const ngnRaw = row?.ngn_per_usd;
  const lrdRaw = row?.lrd_per_usd;
  const ngn =
    ngnRaw != null && Number.isFinite(Number(ngnRaw)) && Number(ngnRaw) > 0
      ? Number(ngnRaw)
      : DEFAULT_OPERATIONAL_NGN_PER_USD;
  const lrd =
    lrdRaw != null && Number.isFinite(Number(lrdRaw)) && Number(lrdRaw) > 0
      ? Number(lrdRaw)
      : DEFAULT_OPERATIONAL_LRD_PER_USD;
  return { ngnPerUsd: ngn, lrdPerUsd: lrd };
}

export function getLrdPerUsd(): number {
  return getOperationalFx().lrdPerUsd;
}

/** Platform NGN/USD baseline when item-level FX is unset (1385 unless env override in getOperationalFx). */
export function getDefaultNgnPerUsd(): number {
  return DEFAULT_OPERATIONAL_NGN_PER_USD;
}

export function ngnKoboToUsdCents(ngnKobo: number, ngnPerUsd: number): number {
  if (!Number.isFinite(ngnKobo) || ngnKobo < 0) return 0;
  if (!Number.isFinite(ngnPerUsd) || ngnPerUsd <= 0) return 0;
  return Math.round(ngnKobo / ngnPerUsd);
}

/** Convert USD cents → LRD cents using operational LD/USD rate. */
export function convertUsdCentsToLrdCents(usdCents: number, lrdPerUsd = getLrdPerUsd()): number {
  if (!Number.isFinite(usdCents)) return 0;
  return Math.round((usdCents * lrdPerUsd) / 100);
}

/** Convert LRD cents → USD cents. */
export function convertLrdCentsToUsdCents(lrdCents: number, lrdPerUsd = getLrdPerUsd()): number {
  if (!Number.isFinite(lrdCents) || lrdPerUsd <= 0) return 0;
  return Math.round((lrdCents * 100) / lrdPerUsd);
}

/**
 * When switching sell currency between USD and LRD, convert the entered unit price (major units string)
 * from `from` to `to`. Returns major-units string with reasonable precision.
 */
export function convertRetailUnitMajorOnCurrencySwitch(
  unitPriceMajorStr: string,
  from: "USD" | "LRD",
  to: "USD" | "LRD",
): string {
  if (from === to) return unitPriceMajorStr;
  const cents = parseMoneyToCents(unitPriceMajorStr);
  if (cents == null) return "";
  const lrd = getLrdPerUsd();
  if (from === "USD" && to === "LRD") {
    const lrdCents = convertUsdCentsToLrdCents(cents, lrd);
    return (lrdCents / 100).toFixed(2);
  }
  if (from === "LRD" && to === "USD") {
    const usdCents = convertLrdCentsToUsdCents(cents, lrd);
    return (usdCents / 100).toFixed(2);
  }
  return unitPriceMajorStr;
}

export type EffectiveCostOptions = {
  /** When true, skip weighted-average landed and use supplier + FX + landed ladder only (draft/book view). */
  ignoreWeightedAvg?: boolean;
};

/** Weighted-average landed unit cost in USD cents (canonical). */
export function effectiveUnitCostUsdCents(item: InventoryCostingInput, opts?: EffectiveCostOptions): number {
  if (!opts?.ignoreWeightedAvg) {
    const wac = item.weighted_avg_landed_usd_cents;
    if (wac != null && wac > 0) return wac;
  }

  const landed = item.landed_usd_cents_per_unit ?? 0;
  if (item.cost_currency === "USD") {
    return Math.max(0, Math.round(item.avg_unit_cost_cents) + landed);
  }
  if (item.cost_currency === "NGN") {
    const fx =
      item.fx_ngn_per_usd != null && item.fx_ngn_per_usd > 0 ? Number(item.fx_ngn_per_usd) : getDefaultNgnPerUsd();
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

export function inventoryValueUsdCents(item: InventoryCostingInput): number {
  const q = Number(item.quantity_on_hand);
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.round(q * effectiveUnitCostUsdCents(item));
}

/** Per-unit gross profit in USD cents (retail USD − landed WAC USD). */
export function unitGrossProfitUsdCents(item: InventoryCostingInput, opts?: EffectiveCostOptions): number | null {
  const sell = item.sell_price_usd_cents;
  if (sell == null || sell <= 0) return null;
  const cost = effectiveUnitCostUsdCents(item, opts);
  return sell - cost;
}

export function unitGrossMarginPct(item: InventoryCostingInput, opts?: EffectiveCostOptions): number | null {
  const sell = item.sell_price_usd_cents;
  if (sell == null || sell <= 0) return null;
  const p = unitGrossProfitUsdCents(item, opts);
  if (p == null) return null;
  return (p / sell) * 100;
}

/** Assemble costing shape from inventory form major-unit fields (live preview on client). */
export function inventoryCostingFromFormMajors(input: {
  avgUnitCostMajor: number;
  costCurrency: SalonCurrency;
  fxNgnPerUsdText: string;
  landedUsdMajor: number;
  sellUsdMajor: number;
  sellLrdMajor: number;
  storeUsdMajor: number;
  postedWacUsdCents?: number | null;
}): InventoryCostingInput {
  const fxRaw = input.fxNgnPerUsdText.trim();
  const fx =
    fxRaw !== "" && Number.isFinite(Number(fxRaw)) && Number(fxRaw) > 0 ? Number(fxRaw) : null;
  const wac = input.postedWacUsdCents != null && input.postedWacUsdCents > 0 ? input.postedWacUsdCents : null;
  return {
    avg_unit_cost_cents: Math.round(Math.max(0, input.avgUnitCostMajor) * 100),
    cost_currency: input.costCurrency,
    fx_ngn_per_usd: fx,
    landed_usd_cents_per_unit: Math.round(Math.max(0, input.landedUsdMajor) * 100),
    sell_price_usd_cents: input.sellUsdMajor > 0 ? Math.round(input.sellUsdMajor * 100) : null,
    sell_price_lrd_cents: input.sellLrdMajor > 0 ? Math.round(input.sellLrdMajor * 100) : null,
    store_price_usd_cents: input.storeUsdMajor > 0 ? Math.round(input.storeUsdMajor * 100) : null,
    weighted_avg_landed_usd_cents: wac,
  };
}

/** True when FX field is non-empty but not a valid positive rate (operators should fix or clear it). */
export function isInvalidManualNgnPerUsdField(fxNgnPerUsdText: string): boolean {
  const t = fxNgnPerUsdText.trim();
  if (t === "") return false;
  const n = Number(t);
  return !Number.isFinite(n) || n <= 0;
}

/** Supplier cost → USD cents (excluding landed uplift) — for live conversion hints. */
export function supplierUnitCostToUsdCentsExclLanded(item: InventoryCostingInput): number {
  const { avg_unit_cost_cents, cost_currency, fx_ngn_per_usd } = item;
  if (cost_currency === "USD") return Math.max(0, Math.round(avg_unit_cost_cents));
  if (cost_currency === "NGN") {
    const fx =
      fx_ngn_per_usd != null && fx_ngn_per_usd > 0 ? Number(fx_ngn_per_usd) : getDefaultNgnPerUsd();
    return ngnKoboToUsdCents(avg_unit_cost_cents, fx);
  }
  if (cost_currency === "LRD") {
    const perUsd = getLrdPerUsd();
    return Math.max(0, Math.round(avg_unit_cost_cents / perUsd));
  }
  return 0;
}

/** Margin % when retail is `unitPriceMinor` in USD or LRD and cost basis is WAC in USD cents. */
export function unitMarginPctAtRetailPriceMinor(
  unitPriceMinor: number,
  currency: "USD" | "LRD",
  wacUsdCentsPerUnit: number,
): number | null {
  if (!Number.isFinite(unitPriceMinor) || unitPriceMinor <= 0) return null;
  const retailUsdCents =
    currency === "USD" ? Math.round(unitPriceMinor) : convertLrdCentsToUsdCents(Math.round(unitPriceMinor));
  if (retailUsdCents <= 0) return null;
  const gp = retailUsdCents - wacUsdCentsPerUnit;
  return (gp / retailUsdCents) * 100;
}

/** One-line operational FX hint for admin UI (official baseline unless settings loaded server-side). */
export function formatOperationalFxSummaryLine(): string {
  return formatOperationalFxSummaryLineFromRates(resolveOperationalFxFromSettings(null));
}

export function formatOperationalFxSummaryLineFromRates(rates: OperationalFxRates): string {
  const ngn = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(rates.ngnPerUsd);
  const lrd = new Intl.NumberFormat("en-LR", { maximumFractionDigits: 2 }).format(rates.lrdPerUsd);
  return `₦${ngn}/USD · LD ${lrd}/USD`;
}

/** Line revenue in USD cents for qty × unit price in `currency`. */
export function lineRevenueUsdEquivCents(unitPriceMinor: number, qty: number, currency: SalonCurrency): number {
  const line = Math.round(qty * unitPriceMinor);
  if (currency === "USD") return line;
  if (currency === "LRD") {
    return convertLrdCentsToUsdCents(line, getLrdPerUsd());
  }
  if (currency === "NGN") {
    const perUsd = getDefaultNgnPerUsd();
    return Math.round(line / perUsd);
  }
  return line;
}

/** Retail sale line preview (client or server). */
export function saleLineFinancialPreview(input: {
  qty: number;
  unitPriceCents: number;
  currency: Extract<SalonCurrency, "USD" | "LRD">;
  wacUsdCentsPerUnit: number;
}): {
  revenueUsdCents: number;
  grossProfitUsdCents: number;
  marginPct: number | null;
  totalNativeCents: number;
} {
  const qty = Number.isFinite(input.qty) ? input.qty : 0;
  const unit = Number.isFinite(input.unitPriceCents) ? input.unitPriceCents : 0;
  const totalNativeCents = Math.round(qty * unit);
  const revenueUsdCents = lineRevenueUsdEquivCents(unit, qty, input.currency);
  const costUsdCents = Math.round(qty * input.wacUsdCentsPerUnit);
  const grossProfitUsdCents = revenueUsdCents - costUsdCents;
  const marginPct = revenueUsdCents > 0 ? (grossProfitUsdCents / revenueUsdCents) * 100 : null;
  return { revenueUsdCents, grossProfitUsdCents, marginPct, totalNativeCents };
}

/** Display helper: complementary currency line under retail input. */
export function complementaryRetailLabel(
  unitPriceMajorStr: string,
  currency: "USD" | "LRD",
): { equivalentLabel: string; equivalentCents: number; equivalentCurrency: "USD" | "LRD" } | null {
  const cents = parseMoneyToCents(unitPriceMajorStr);
  if (cents == null || cents <= 0) return null;
  if (currency === "USD") {
    const lrd = convertUsdCentsToLrdCents(cents);
    return { equivalentLabel: "LRD", equivalentCents: lrd, equivalentCurrency: "LRD" };
  }
  const usd = convertLrdCentsToUsdCents(cents);
  return { equivalentLabel: "USD", equivalentCents: usd, equivalentCurrency: "USD" };
}
