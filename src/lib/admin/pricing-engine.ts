/**
 * Central operational FX and pricing math for inventory, purchases, sales, and reporting.
 * All modules should use this module (directly or via `salon-finance` re-exports) — do not duplicate FX.
 *
 * Canonical minor-unit contract (must match SQL helpers):
 *   usd_cents = ngn_kobo / ngn_per_usd
 *   ngn_kobo  = usd_cents * ngn_per_usd
 *   usd_cents = lrd_cents / lrd_per_usd
 *   lrd_cents = usd_cents * lrd_per_usd
 *
 * FX rate source (runtime preference):
 *   1. Caller-supplied `OperationalFxRates` from `operational_settings` (via resolveOperationalFxFromSettings)
 *   2. Item-level `fx_ngn_per_usd` when converting that item's NGN cost
 *   3. Safe fallback constants DEFAULT_OPERATIONAL_* (seed/baseline 1385 NGN / 190 LRD) — only when settings are absent
 *
 * WAC (weighted average cost):
 *   - Canonical currency is USD. Stored as `weighted_avg_landed_usd_cents`.
 *   - NGN/LRD purchase costs are converted to USD at entry/receipt using the operational FX rate in effect then.
 *   - Later FX setting changes do NOT rewrite historical WAC unless an explicit admin recalculation action runs.
 *
 * LRD and USD both use 1/100 minor units; never multiply/divide by an extra 100 for FX (no LRD 100× bug).
 *
 * Seeded operational baseline: 1 USD = 1,385 NGN · 1 USD = 190 LRD.
 */

import type { SalonCurrency } from "@/lib/admin/salon-format";
import { parseMoneyToCents } from "@/lib/admin/salon-format";
import {
  inventoryNeedsSetup as inventoryNeedsSetupFromStatus,
  type InventorySetupFields,
} from "@/lib/admin/inventory-sellability";

/** Minimal row shape for costing — avoids circular imports with `salon-queries`. */
export type InventoryCostingInput = {
  avg_unit_cost_cents: number | null;
  cost_currency: SalonCurrency;
  landed_usd_cents_per_unit?: number | null;
  fx_ngn_per_usd?: number | null;
  weighted_avg_landed_usd_cents?: number | null;
  sell_price_usd_cents?: number | null;
  sell_price_lrd_cents?: number | null;
  quantity_on_hand?: number;
  store_price_usd_cents?: number | null;
};

/** Official operational NGN/USD baseline — seed/fallback ONLY when operational_settings is unset. */
export const DEFAULT_OPERATIONAL_NGN_PER_USD = 1385;
/** Official operational LRD/USD baseline — seed/fallback ONLY when operational_settings is unset. */
export const DEFAULT_OPERATIONAL_LRD_PER_USD = 190;

export type OperationalFxRates = {
  /** NGN per 1 USD (major), e.g. 1385 */
  ngnPerUsd: number;
  /** Liberian dollars per 1 USD (major), e.g. 190 */
  lrdPerUsd: number;
};

/**
 * Env override optional; otherwise official baseline (1385 / 190).
 * Prefer `resolveOperationalFxFromSettings` on server paths that load operational_settings.
 */
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

/**
 * Platform NGN/USD fallback when settings/`operationalFx` are not available.
 * Uses env-aware getOperationalFx() — not a silent literal. Still prefer resolveOperationalFxFromSettings.
 */
export function getDefaultNgnPerUsd(): number {
  return getOperationalFx().ngnPerUsd;
}

/** NGN kobo → USD cents: usd_cents = ngn_kobo / ngn_per_usd */
export function ngnKoboToUsdCents(ngnKobo: number, ngnPerUsd: number): number {
  if (!Number.isFinite(ngnKobo) || ngnKobo < 0) return 0;
  if (!Number.isFinite(ngnPerUsd) || ngnPerUsd <= 0) return 0;
  return Math.round(ngnKobo / ngnPerUsd);
}

/** USD cents → NGN kobo: ngn_kobo = usd_cents × ngn_per_usd */
export function usdCentsToNgnKobo(usdCents: number, ngnPerUsd: number): number {
  if (!Number.isFinite(usdCents) || usdCents < 0) return 0;
  if (!Number.isFinite(ngnPerUsd) || ngnPerUsd <= 0) return 0;
  return Math.round(usdCents * ngnPerUsd);
}

/**
 * Convert USD cents → LRD cents: lrd_cents = usd_cents × lrd_per_usd
 * (Both currencies use 1/100 minor units; FX is major-per-major so no extra /100 — avoids LRD 100× bug.)
 */
export function convertUsdCentsToLrdCents(usdCents: number, lrdPerUsd = getLrdPerUsd()): number {
  if (!Number.isFinite(usdCents) || usdCents < 0) return 0;
  if (!Number.isFinite(lrdPerUsd) || lrdPerUsd <= 0) return 0;
  return Math.round(usdCents * lrdPerUsd);
}

/** Convert LRD cents → USD cents: usd_cents = lrd_cents / lrd_per_usd (no extra ×100). */
export function convertLrdCentsToUsdCents(lrdCents: number, lrdPerUsd = getLrdPerUsd()): number {
  if (!Number.isFinite(lrdCents) || lrdCents < 0) return 0;
  if (!Number.isFinite(lrdPerUsd) || lrdPerUsd <= 0) return 0;
  return Math.round(lrdCents / lrdPerUsd);
}

/**
 * When switching sell currency between USD and LRD, convert the entered unit price (major units string)
 * from `from` to `to`. Pass `fx` from operational settings when available.
 */
export function convertRetailUnitMajorOnCurrencySwitch(
  unitPriceMajorStr: string,
  from: "USD" | "LRD",
  to: "USD" | "LRD",
  fx?: OperationalFxRates,
): string {
  if (from === to) return unitPriceMajorStr;
  const cents = parseMoneyToCents(unitPriceMajorStr);
  if (cents == null) return "";
  const lrd = fx?.lrdPerUsd && fx.lrdPerUsd > 0 ? fx.lrdPerUsd : getLrdPerUsd();
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
  /** Operational FX when item-level NGN FX is unset (defaults to platform baseline). */
  operationalFx?: OperationalFxRates;
};

function resolveNgnFx(itemFx: number | null | undefined, operationalFx?: OperationalFxRates): number {
  if (itemFx != null && itemFx > 0) return Number(itemFx);
  if (operationalFx && operationalFx.ngnPerUsd > 0) return operationalFx.ngnPerUsd;
  return getDefaultNgnPerUsd();
}

function resolveLrdFx(operationalFx?: OperationalFxRates): number {
  if (operationalFx && operationalFx.lrdPerUsd > 0) return operationalFx.lrdPerUsd;
  return getLrdPerUsd();
}

/** Weighted-average landed unit cost in USD cents (canonical WAC currency). */
export function effectiveUnitCostUsdCents(item: InventoryCostingInput, opts?: EffectiveCostOptions): number {
  if (!opts?.ignoreWeightedAvg) {
    const wac = item.weighted_avg_landed_usd_cents;
    if (wac != null && wac > 0) return wac;
  }

  const landed = item.landed_usd_cents_per_unit ?? 0;
  const avg = item.avg_unit_cost_cents;
  if (avg == null || avg <= 0) return landed;

  if (item.cost_currency === "USD") {
    return Math.max(0, Math.round(avg) + landed);
  }
  if (item.cost_currency === "NGN") {
    const fx = resolveNgnFx(item.fx_ngn_per_usd, opts?.operationalFx);
    const usd = ngnKoboToUsdCents(avg, fx);
    return usd + landed;
  }
  if (item.cost_currency === "LRD") {
    const perUsd = resolveLrdFx(opts?.operationalFx);
    const usd = Math.round(avg / perUsd);
    return usd + landed;
  }
  return landed;
}

export function inventoryValueUsdCents(item: InventoryCostingInput, opts?: EffectiveCostOptions): number {
  const q = Number(item.quantity_on_hand);
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.round(q * effectiveUnitCostUsdCents(item, opts));
}

/** True when item has a positive USD cost basis (WAC / supplier / landed). Missing ≠ zero. */
export function hasPositiveUnitCostUsd(item: InventoryCostingInput, opts?: EffectiveCostOptions): boolean {
  const wac = item.weighted_avg_landed_usd_cents;
  if (wac != null && wac > 0) return true;
  const landed = item.landed_usd_cents_per_unit ?? 0;
  const avg = item.avg_unit_cost_cents;
  if (avg != null && avg > 0) return true;
  if (landed > 0) return true;
  void opts;
  return false;
}

/** Per-unit gross profit in USD cents (retail USD − landed WAC USD). Negative GP is preserved. */
export function unitGrossProfitUsdCents(item: InventoryCostingInput, opts?: EffectiveCostOptions): number | null {
  const sell = item.sell_price_usd_cents;
  if (sell == null || sell <= 0) return null;
  if (!hasPositiveUnitCostUsd(item, opts)) return null;
  const cost = effectiveUnitCostUsdCents(item, opts);
  return sell - cost;
}

export function unitGrossMarginPct(item: InventoryCostingInput, opts?: EffectiveCostOptions): number | null {
  const sell = item.sell_price_usd_cents;
  if (sell == null || sell <= 0) return null;
  if (!hasPositiveUnitCostUsd(item, opts)) return null;
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
export function supplierUnitCostToUsdCentsExclLanded(
  item: InventoryCostingInput,
  operationalFx?: OperationalFxRates,
): number {
  const { avg_unit_cost_cents, cost_currency, fx_ngn_per_usd } = item;
  if (avg_unit_cost_cents == null || avg_unit_cost_cents <= 0) return 0;
  if (cost_currency === "USD") return Math.max(0, Math.round(avg_unit_cost_cents));
  if (cost_currency === "NGN") {
    const fx = resolveNgnFx(fx_ngn_per_usd, operationalFx);
    return ngnKoboToUsdCents(avg_unit_cost_cents, fx);
  }
  if (cost_currency === "LRD") {
    const perUsd = resolveLrdFx(operationalFx);
    return Math.max(0, Math.round(avg_unit_cost_cents / perUsd));
  }
  return 0;
}

/** Margin % when retail is `unitPriceMinor` in USD or LRD and cost basis is WAC in USD cents. */
export function unitMarginPctAtRetailPriceMinor(
  unitPriceMinor: number,
  currency: "USD" | "LRD",
  wacUsdCentsPerUnit: number,
  lrdPerUsd = getLrdPerUsd(),
): number | null {
  if (!Number.isFinite(unitPriceMinor) || unitPriceMinor <= 0) return null;
  const retailUsdCents =
    currency === "USD"
      ? Math.round(unitPriceMinor)
      : convertLrdCentsToUsdCents(Math.round(unitPriceMinor), lrdPerUsd);
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

/**
 * Line revenue in USD cents for qty × unit price in `currency`.
 * When converting NGN/LRD, pass `fx` from operational_settings — do not rely on silent baseline fallback.
 */
export function lineRevenueUsdEquivCents(
  unitPriceMinor: number,
  qty: number,
  currency: SalonCurrency,
  fx?: OperationalFxRates,
): number {
  const line = Math.round(qty * unitPriceMinor);
  if (currency === "USD") return line;
  if (currency === "LRD") {
    const lrd = fx?.lrdPerUsd && fx.lrdPerUsd > 0 ? fx.lrdPerUsd : getLrdPerUsd();
    return convertLrdCentsToUsdCents(line, lrd);
  }
  if (currency === "NGN") {
    const perUsd = fx?.ngnPerUsd && fx.ngnPerUsd > 0 ? fx.ngnPerUsd : getDefaultNgnPerUsd();
    return ngnKoboToUsdCents(line, perUsd);
  }
  return line;
}

/** Retail sale line preview (client or server). Negative GP preserved. Missing WAC → no fake 100% margin. */
export function saleLineFinancialPreview(input: {
  qty: number;
  unitPriceCents: number;
  currency: Extract<SalonCurrency, "USD" | "LRD">;
  wacUsdCentsPerUnit: number | null | undefined;
  fx?: OperationalFxRates;
}): {
  revenueUsdCents: number;
  grossProfitUsdCents: number | null;
  marginPct: number | null;
  totalNativeCents: number;
  costMissing: boolean;
} {
  const qty = Number.isFinite(input.qty) ? input.qty : 0;
  const unit = Number.isFinite(input.unitPriceCents) ? input.unitPriceCents : 0;
  const totalNativeCents = Math.round(qty * unit);
  const revenueUsdCents = lineRevenueUsdEquivCents(unit, qty, input.currency, input.fx);
  const wac = input.wacUsdCentsPerUnit;
  if (wac == null || !Number.isFinite(wac) || wac <= 0) {
    return {
      revenueUsdCents,
      grossProfitUsdCents: null,
      marginPct: null,
      totalNativeCents,
      costMissing: true,
    };
  }
  const costUsdCents = Math.round(qty * wac);
  const grossProfitUsdCents = revenueUsdCents - costUsdCents;
  const marginPct = revenueUsdCents > 0 ? (grossProfitUsdCents / revenueUsdCents) * 100 : null;
  return { revenueUsdCents, grossProfitUsdCents, marginPct, totalNativeCents, costMissing: false };
}

/** Display helper: complementary currency line under retail input. */
export function complementaryRetailLabel(
  unitPriceMajorStr: string,
  currency: "USD" | "LRD",
  fx?: OperationalFxRates,
): { equivalentLabel: string; equivalentCents: number; equivalentCurrency: "USD" | "LRD" } | null {
  const cents = parseMoneyToCents(unitPriceMajorStr);
  if (cents == null || cents <= 0) return null;
  const lrdRate = fx?.lrdPerUsd && fx.lrdPerUsd > 0 ? fx.lrdPerUsd : getLrdPerUsd();
  if (currency === "USD") {
    const lrd = convertUsdCentsToLrdCents(cents, lrdRate);
    return { equivalentLabel: "LRD", equivalentCents: lrd, equivalentCurrency: "LRD" };
  }
  const usd = convertLrdCentsToUsdCents(cents, lrdRate);
  return { equivalentLabel: "USD", equivalentCents: usd, equivalentCurrency: "USD" };
}

/** Persist/prefer setup_status via inventory-sellability; re-exported for existing import sites. */
export function inventoryNeedsSetup(item: InventorySetupFields): boolean {
  return inventoryNeedsSetupFromStatus(item);
}
