import { describe, expect, it } from "vitest";
import {
  buildSalesLogHref,
  monroviaDayHalfOpenWindow,
  monroviaLastNDaysInclusive,
  parseSalesLogSearchParams,
  resolveSalesLogDateBounds,
  salesLogSoldAtPredicates,
  salesLogWeekStartPredicates,
  SALES_LOG_BUSINESS_TIMEZONE,
} from "@/lib/admin/sales-log-filters";
import { summarizeFilteredSalesLog } from "@/lib/admin/sales-log-filtered-totals";
import { getMonroviaDayKey } from "@/lib/admin/salon-format";

/** Fixed Monrovia noon on 2026-07-16 (UTC+0). */
const FIXED_NOW = new Date("2026-07-16T12:00:00.000Z");

describe("sales-log-filters date parsing", () => {
  it("uses Africa/Monrovia as business timezone", () => {
    expect(SALES_LOG_BUSINESS_TIMEZONE).toBe("Africa/Monrovia");
    expect(getMonroviaDayKey(FIXED_NOW)).toBe("2026-07-16");
  });

  it("resolves today as inclusive start / next-day exclusive end", () => {
    const bounds = resolveSalesLogDateBounds("today", null, null, FIXED_NOW);
    expect(bounds.kind).toBe("bounded");
    if (bounds.kind !== "bounded") return;
    expect(bounds.fromYmd).toBe("2026-07-16");
    expect(bounds.toYmdInclusive).toBe("2026-07-16");
    expect(bounds.startIsoInclusive).toBe("2026-07-16T00:00:00.000Z");
    expect(bounds.endIsoExclusive).toBe("2026-07-17T00:00:00.000Z");
    expect(bounds.startDateInclusive).toBe("2026-07-16");
    expect(bounds.endDateExclusive).toBe("2026-07-17");
  });

  it("resolves last 7 days inclusively", () => {
    const bounds = resolveSalesLogDateBounds("7d", null, null, FIXED_NOW);
    expect(bounds.kind).toBe("bounded");
    if (bounds.kind !== "bounded") return;
    expect(bounds.fromYmd).toBe("2026-07-10");
    expect(bounds.toYmdInclusive).toBe("2026-07-16");
    expect(bounds.endIsoExclusive).toBe("2026-07-17T00:00:00.000Z");
  });

  it("resolves this calendar month", () => {
    const bounds = resolveSalesLogDateBounds("month", null, null, FIXED_NOW);
    expect(bounds.kind).toBe("bounded");
    if (bounds.kind !== "bounded") return;
    expect(bounds.fromYmd).toBe("2026-07-01");
    expect(bounds.toYmdInclusive).toBe("2026-07-16");
    expect(bounds.startIsoInclusive).toBe("2026-07-01T00:00:00.000Z");
    expect(bounds.endIsoExclusive).toBe("2026-07-17T00:00:00.000Z");
  });

  it("all time applies no date predicate", () => {
    const bounds = resolveSalesLogDateBounds("all", null, null, FIXED_NOW);
    expect(bounds).toEqual({ kind: "all" });
  });

  it("valid custom range is half-open inclusive/exclusive", () => {
    const bounds = resolveSalesLogDateBounds("custom", "2026-07-01", "2026-07-07", FIXED_NOW);
    expect(bounds.kind).toBe("bounded");
    if (bounds.kind !== "bounded") return;
    expect(bounds.fromYmd).toBe("2026-07-01");
    expect(bounds.toYmdInclusive).toBe("2026-07-07");
    expect(bounds.startIsoInclusive).toBe("2026-07-01T00:00:00.000Z");
    expect(bounds.endIsoExclusive).toBe("2026-07-08T00:00:00.000Z");
  });

  it("invalid calendar dates and end-before-start fall back safely", () => {
    const badDate = parseSalesLogSearchParams(
      { range: "custom", from: "2026-02-30", to: "2026-03-01" },
      FIXED_NOW,
    );
    expect(badDate.usedFallback).toBe(true);
    expect(badDate.range).toBe("month");

    const inverted = parseSalesLogSearchParams(
      { range: "custom", from: "2026-07-10", to: "2026-07-01" },
      FIXED_NOW,
    );
    expect(inverted.usedFallback).toBe(true);
    expect(inverted.range).toBe("month");
  });

  it("unknown range falls back to this month", () => {
    const parsed = parseSalesLogSearchParams({ range: "yesterday" }, FIXED_NOW);
    expect(parsed.usedFallback).toBe(true);
    expect(parsed.range).toBe("month");
    expect(parsed.bounds.kind).toBe("bounded");
    if (parsed.bounds.kind !== "bounded") return;
    expect(parsed.bounds.fromYmd).toBe("2026-07-01");
  });

  it("unknown source falls back to all", () => {
    const parsed = parseSalesLogSearchParams({ range: "today", source: "widgets" }, FIXED_NOW);
    expect(parsed.usedFallback).toBe(true);
    expect(parsed.source).toBe("all");
  });

  it("monroviaDayHalfOpenWindow is deterministic", () => {
    const w = monroviaDayHalfOpenWindow("2026-07-01");
    expect(w.startIso).toBe("2026-07-01T00:00:00.000Z");
    expect(w.endIsoExclusive).toBe("2026-07-02T00:00:00.000Z");
  });

  it("monroviaLastNDaysInclusive matches rolling KPI windows", () => {
    expect(monroviaLastNDaysInclusive(30, FIXED_NOW)).toEqual({
      from: "2026-06-17",
      to: "2026-07-16",
    });
    expect(monroviaLastNDaysInclusive(7, FIXED_NOW)).toEqual({
      from: "2026-07-10",
      to: "2026-07-16",
    });
  });

  it("retail, service, and stylist-fee queries share the same calendar window", () => {
    const bounds = resolveSalesLogDateBounds("custom", "2026-07-01", "2026-07-07", FIXED_NOW);
    const soldAt = salesLogSoldAtPredicates(bounds);
    const weekStart = salesLogWeekStartPredicates(bounds);
    expect(soldAt).toEqual({
      gte: "2026-07-01T00:00:00.000Z",
      lt: "2026-07-08T00:00:00.000Z",
    });
    expect(weekStart).toEqual({
      gte: "2026-07-01",
      lt: "2026-07-08",
    });
    expect(salesLogSoldAtPredicates({ kind: "all" })).toBeNull();
    expect(salesLogWeekStartPredicates({ kind: "all" })).toBeNull();
  });
});

describe("buildSalesLogHref", () => {
  it("builds canonical internal paths only", () => {
    expect(buildSalesLogHref({ range: "today" })).toBe("/admin/sales-log?range=today");
    expect(buildSalesLogHref({ range: "month", source: "retail" })).toBe(
      "/admin/sales-log?range=month&source=retail",
    );
    expect(buildSalesLogHref({ range: "today", source: "services" })).toContain("source=services");
    expect(buildSalesLogHref({ range: "7d", source: "stylist-fees" })).toBe(
      "/admin/sales-log?range=7d&source=stylist-fees",
    );
    expect(
      buildSalesLogHref({ range: "custom", from: "2026-06-17", to: "2026-07-16", source: "retail" }),
    ).toBe("/admin/sales-log?range=custom&from=2026-06-17&to=2026-07-16&source=retail");
  });

  it("never emits external URLs", () => {
    const href = buildSalesLogHref({ range: "today", source: "retail" });
    expect(href.startsWith("/admin/sales-log")).toBe(true);
    expect(href.includes("://")).toBe(false);
    expect(href.includes("http")).toBe(false);
  });

  it("falls back from invalid custom dates", () => {
    expect(buildSalesLogHref({ range: "custom", from: "nope", to: "2026-07-01" })).toBe(
      "/admin/sales-log?range=month",
    );
  });

  it("dashboard card destinations match KPI definitions", () => {
    expect(buildSalesLogHref({ range: "today" })).toBe("/admin/sales-log?range=today");
    const last30 = monroviaLastNDaysInclusive(30, FIXED_NOW);
    expect(
      buildSalesLogHref({ range: "custom", from: last30.from, to: last30.to, source: "retail" }),
    ).toBe(`/admin/sales-log?range=custom&from=${last30.from}&to=${last30.to}&source=retail`);
  });
});

describe("summarizeFilteredSalesLog", () => {
  it("totals use filtered records only and respect source", () => {
    const all = summarizeFilteredSalesLog({
      retail: [
        {
          qty: 1,
          unit_price_cents: 1000,
          unit_cost_cents: 400,
          currency: "USD",
          revenue_usd_equiv_cents: 1000,
          gross_profit_usd_cents: 600,
        },
      ],
      services: [{ revenue_cents: 2000, currency: "USD", revenue_usd_equiv_cents: 2000 }],
      rentals: [{ amount_cents: 5000, currency: "USD", amount_usd_equiv_cents: 5000 }],
      source: "all",
    });
    expect(all.retailUsdCents).toBe(1000);
    expect(all.serviceUsdCents).toBe(2000);
    expect(all.rentalUsdCents).toBe(5000);
    expect(all.retailGrossProfitUsdCents).toBe(600);

    const retailOnly = summarizeFilteredSalesLog({
      retail: [
        {
          qty: 1,
          unit_price_cents: 1000,
          unit_cost_cents: 400,
          currency: "USD",
          revenue_usd_equiv_cents: 1000,
        },
      ],
      services: [{ revenue_cents: 2000, currency: "USD", revenue_usd_equiv_cents: 2000 }],
      rentals: [{ amount_cents: 5000, currency: "USD", amount_usd_equiv_cents: 5000 }],
      source: "retail",
    });
    expect(retailOnly.serviceUsdCents).toBe(0);
    expect(retailOnly.rentalUsdCents).toBe(0);
    expect(retailOnly.retailUsdCents).toBe(1000);
  });

  it("excludes unknown historical rental conversions from USD totals", () => {
    const totals = summarizeFilteredSalesLog({
      retail: [],
      services: [],
      rentals: [
        { amount_cents: 10000, currency: "LRD", amount_usd_equiv_cents: null },
        { amount_cents: 2500, currency: "USD", amount_usd_equiv_cents: 2500 },
      ],
      source: "stylist-fees",
    });
    expect(totals.rentalUsdCents).toBe(2500);
    expect(totals.rentalCoverage.rowsConversionUnavailable).toBe(1);
    expect(totals.rentalCoverage.isPartial).toBe(true);
    expect(totals.rentalCoverage.coverageLabel).toBeTruthy();
  });

  it("keeps margin coverage accurate under filters", () => {
    const totals = summarizeFilteredSalesLog({
      retail: [
        {
          qty: 1,
          unit_price_cents: 1000,
          unit_cost_cents: 400,
          currency: "USD",
          revenue_usd_equiv_cents: 1000,
        },
        {
          qty: 1,
          unit_price_cents: 500,
          unit_cost_cents: null,
          currency: "USD",
          revenue_usd_equiv_cents: 500,
        },
      ],
      services: [],
      rentals: [],
      source: "retail",
    });
    expect(totals.retailMarginPartial).toBe(true);
    expect(totals.retailCostCoverageLabel).toMatch(/1 of 2/);
    expect(totals.retailGrossProfitUsdCents).toBe(600);
  });

  it("preserves null gross profit when all costs are missing", () => {
    const totals = summarizeFilteredSalesLog({
      retail: [
        {
          qty: 1,
          unit_price_cents: 1000,
          unit_cost_cents: null,
          currency: "USD",
          revenue_usd_equiv_cents: 1000,
        },
        {
          qty: 2,
          unit_price_cents: 500,
          unit_cost_cents: 0,
          currency: "USD",
          revenue_usd_equiv_cents: 1000,
        },
      ],
      services: [],
      rentals: [],
      source: "retail",
    });
    expect(totals.retailGrossProfitUsdCents).toBeNull();
    expect(totals.retailMarginPct).toBeNull();
    expect(totals.retailUsdCents).toBe(2000);
    expect(totals.retailCostCoverageLabel).toMatch(/0 of 2/);
  });

  it("preserves real zero gross profit as zero (break-even)", () => {
    const totals = summarizeFilteredSalesLog({
      retail: [
        {
          qty: 1,
          unit_price_cents: 1000,
          unit_cost_cents: 1000,
          currency: "USD",
          revenue_usd_equiv_cents: 1000,
          gross_profit_usd_cents: 0,
        },
      ],
      services: [],
      rentals: [],
      source: "retail",
    });
    expect(totals.retailGrossProfitUsdCents).toBe(0);
    expect(totals.retailGrossProfitUsdCents).not.toBeNull();
  });
});
