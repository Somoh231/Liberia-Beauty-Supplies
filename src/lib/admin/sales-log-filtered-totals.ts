/**
 * Totals for Sales Log filtered views — computed only from rows in the active date/source window.
 */

import { aggregateGrossMargin, computeGrossMarginLine, formatCostCoverage } from "@/lib/admin/gross-margin";
import { lineRevenueUsdEquivCents } from "@/lib/admin/pricing-engine";
import type { SalonCurrency } from "@/lib/admin/salon-format";
import {
  aggregateSpaceLeaseUsd,
  type SpaceLeaseUsdCoverage,
  type SpaceLeaseUsdRow,
} from "@/lib/admin/space-lease-currency";
import type { SalesLogSource } from "@/lib/admin/sales-log-filters";

export type FilteredCurrencyTotals = { USD: number; LRD: number };

export type FilteredRetailLite = {
  qty: number;
  unit_price_cents: number;
  unit_cost_cents: number | null;
  currency: SalonCurrency;
  revenue_usd_equiv_cents: number | null;
  gross_profit_usd_cents?: number | null;
};

export type FilteredServiceLite = {
  revenue_cents: number;
  currency: SalonCurrency;
  revenue_usd_equiv_cents: number | null;
};

export type FilteredSalesLogTotals = {
  retailUsdCents: number;
  serviceUsdCents: number;
  rentalUsdCents: number;
  retailNative: FilteredCurrencyTotals;
  serviceNative: FilteredCurrencyTotals;
  rentalNative: FilteredCurrencyTotals;
  retailCount: number;
  serviceCount: number;
  rentalCount: number;
  rentalCoverage: SpaceLeaseUsdCoverage;
  /** Retail product gross margin only (services/stylist fees excluded). Null when unavailable. */
  retailGrossProfitUsdCents: number | null;
  retailMarginPct: number | null;
  retailMarginPartial: boolean;
  retailCostCoverageLabel: string | null;
};

function emptyNative(): FilteredCurrencyTotals {
  return { USD: 0, LRD: 0 };
}

function addNative(bag: FilteredCurrencyTotals, currency: SalonCurrency, minor: number) {
  if (currency === "USD") bag.USD += minor;
  else if (currency === "LRD") bag.LRD += minor;
}

/**
 * Aggregate filtered Sales Log money figures from already date-filtered rows.
 * Apply `source` to zero out / skip categories not in view.
 */
export function summarizeFilteredSalesLog(input: {
  retail: FilteredRetailLite[];
  services: FilteredServiceLite[];
  rentals: SpaceLeaseUsdRow[];
  source?: SalesLogSource;
}): FilteredSalesLogTotals {
  const source = input.source ?? "all";
  const includeRetail = source === "all" || source === "retail";
  const includeServices = source === "all" || source === "services";
  const includeRentals = source === "all" || source === "stylist-fees";

  const retail = includeRetail ? input.retail : [];
  const services = includeServices ? input.services : [];
  const rentals = includeRentals ? input.rentals : [];

  const retailNative = emptyNative();
  const serviceNative = emptyNative();
  const rentalNative = emptyNative();
  let retailUsdCents = 0;
  let serviceUsdCents = 0;

  const marginLines: ReturnType<typeof computeGrossMarginLine>[] = [];

  for (const s of retail) {
    const line = Math.round(s.qty * s.unit_price_cents);
    addNative(retailNative, s.currency, line);
    const revUsd =
      s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.unit_price_cents, s.qty, s.currency);
    retailUsdCents += revUsd;
    marginLines.push(
      computeGrossMarginLine({
        revenueUsdCents: revUsd,
        unitCostUsdCents: s.unit_cost_cents,
        qty: s.qty,
        grossProfitUsdCents: s.gross_profit_usd_cents ?? null,
      }),
    );
  }

  for (const s of services) {
    addNative(serviceNative, s.currency, s.revenue_cents);
    serviceUsdCents +=
      s.revenue_usd_equiv_cents ?? lineRevenueUsdEquivCents(s.revenue_cents, 1, s.currency);
  }

  for (const r of rentals) {
    addNative(rentalNative, r.currency as SalonCurrency, r.amount_cents);
  }

  const rentalCoverage = aggregateSpaceLeaseUsd(rentals);
  const margin = aggregateGrossMargin(marginLines);

  return {
    retailUsdCents,
    serviceUsdCents,
    rentalUsdCents: rentalCoverage.usdTotalCents,
    retailNative,
    serviceNative,
    rentalNative,
    retailCount: retail.length,
    serviceCount: services.length,
    rentalCount: rentals.length,
    rentalCoverage,
    retailGrossProfitUsdCents: margin.grossProfitUsdCents,
    retailMarginPct: margin.marginPct,
    retailMarginPartial: margin.isPartial,
    retailCostCoverageLabel: formatCostCoverage(margin),
  };
}

/** Whether any visible source has rows under the active filters. */
export function filteredSalesLogHasRows(totals: FilteredSalesLogTotals, source: SalesLogSource): boolean {
  if (source === "retail") return totals.retailCount > 0;
  if (source === "services") return totals.serviceCount > 0;
  if (source === "stylist-fees") return totals.rentalCount > 0;
  return totals.retailCount + totals.serviceCount + totals.rentalCount > 0;
}
