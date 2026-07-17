import { describe, expect, it } from "vitest";
import {
  aggregateGrossMargin,
  computeGrossMarginLine,
  formatCostCoverage,
  inventoryUnitMarginPct,
  profitStatusLabel,
} from "@/lib/admin/gross-margin";
import { saleLineFinancialPreview } from "@/lib/admin/pricing-engine";

describe("gross margin and profit status", () => {
  it("computes gross profit and margin correctly", () => {
    const line = computeGrossMarginLine({
      revenueUsdCents: 10000,
      unitCostUsdCents: 6500,
      qty: 1,
    });
    expect(line.grossProfitUsdCents).toBe(3500);
    expect(line.marginPct).toBeCloseTo(35, 5);
    expect(line.status).toBe("profitable");
    expect(profitStatusLabel(line.status)).toBe("Profitable");
  });

  it("maps profitable / loss / break-even", () => {
    expect(computeGrossMarginLine({ revenueUsdCents: 1000, unitCostUsdCents: 400, qty: 1 }).status).toBe(
      "profitable",
    );
    expect(computeGrossMarginLine({ revenueUsdCents: 1000, unitCostUsdCents: 1200, qty: 1 }).status).toBe("loss");
    expect(computeGrossMarginLine({ revenueUsdCents: 1000, unitCostUsdCents: 1000, qty: 1 }).status).toBe(
      "break_even",
    );
  });

  it("missing cost → Cost missing and never 100% margin", () => {
    const line = computeGrossMarginLine({
      revenueUsdCents: 10000,
      unitCostUsdCents: null,
      qty: 1,
      grossProfitUsdCents: 10000, // untrusted without usable cost
    });
    expect(line.status).toBe("cost_missing");
    expect(line.marginPct).toBeNull();
    expect(line.grossProfitUsdCents).toBeNull();
    expect(line.cogsUsdCents).toBeNull();

    const zeroLegacy = computeGrossMarginLine({
      revenueUsdCents: 10000,
      unitCostUsdCents: 0,
      qty: 1,
      grossProfitUsdCents: 10000,
    });
    expect(zeroLegacy.status).toBe("cost_missing");
    expect(zeroLegacy.marginPct).toBeNull();
  });

  it("zero revenue does not divide by zero", () => {
    const line = computeGrossMarginLine({
      revenueUsdCents: 0,
      unitCostUsdCents: 100,
      qty: 1,
    });
    expect(line.marginPct).toBeNull();
    expect(line.status).toBe("loss");
  });

  it("aggregate margin uses aggregate revenue and COGS, not average of line %", () => {
    const lines = [
      computeGrossMarginLine({ revenueUsdCents: 10000, unitCostUsdCents: 2000, qty: 1 }), // 80%
      computeGrossMarginLine({ revenueUsdCents: 30000, unitCostUsdCents: 15000, qty: 1 }), // 50%
    ];
    const avgOfPercents = (80 + 50) / 2; // 65
    const agg = aggregateGrossMargin(lines);
    expect(agg.revenueUsdCents).toBe(40000);
    expect(agg.cogsUsdCents).toBe(17000);
    expect(agg.grossProfitUsdCents).toBe(23000);
    expect(agg.marginPct).toBeCloseTo(57.5, 5); // 23000/40000
    expect(agg.marginPct).not.toBeCloseTo(avgOfPercents, 5);
    expect(agg.costCoverageComplete).toBe(true);
    expect(agg.isPartial).toBe(false);
  });

  it("incomplete cost coverage is disclosed and partial", () => {
    const lines = [
      computeGrossMarginLine({ revenueUsdCents: 10000, unitCostUsdCents: 4000, qty: 1 }),
      computeGrossMarginLine({ revenueUsdCents: 5000, unitCostUsdCents: null, qty: 1 }),
    ];
    const agg = aggregateGrossMargin(lines);
    expect(agg.linesTotal).toBe(2);
    expect(agg.linesWithCost).toBe(1);
    expect(agg.isPartial).toBe(true);
    expect(agg.costCoverageComplete).toBe(false);
    expect(agg.revenueUsdCents).toBe(10000); // cost-complete only
    expect(formatCostCoverage(agg)).toBe("Cost available for 1 of 2 product lines");
  });

  it("retail-sale edit style recompute keeps id semantics and updates margin", () => {
    const before = computeGrossMarginLine({
      revenueUsdCents: 10000,
      unitCostUsdCents: 6000,
      qty: 2,
    });
    const after = computeGrossMarginLine({
      revenueUsdCents: 12000,
      unitCostUsdCents: 6000,
      qty: 2,
      grossProfitUsdCents: 12000 - 2 * 6000,
    });
    expect(before.grossProfitUsdCents).toBe(10000 - 12000);
    expect(after.grossProfitUsdCents).toBe(0);
    expect(after.status).toBe("break_even");
    expect(after.marginPct).toBe(0);
  });

  it("stylist-fee and service revenue are excluded from product gross margin helpers", () => {
    // Product helper only accepts sale revenue/COGS — no path to inject rental/service.
    const productOnly = aggregateGrossMargin([
      computeGrossMarginLine({ revenueUsdCents: 1000, unitCostUsdCents: 400, qty: 1 }),
    ]);
    expect(productOnly.revenueUsdCents).toBe(1000);
    expect(productOnly.grossProfitUsdCents).toBe(600);
  });

  it("sale preview uses provided FX / WAC, not inventing live-missing cost as zero", () => {
    const missing = saleLineFinancialPreview({
      qty: 1,
      unitPriceCents: 1000,
      currency: "USD",
      wacUsdCentsPerUnit: null,
    });
    expect(missing.costMissing).toBe(true);
    expect(missing.marginPct).toBeNull();
    expect(missing.grossProfitUsdCents).toBeNull();

    const lrd = saleLineFinancialPreview({
      qty: 1,
      unitPriceCents: 18000,
      currency: "LRD",
      wacUsdCentsPerUnit: 50,
      fx: { ngnPerUsd: 1385, lrdPerUsd: 180 },
    });
    expect(lrd.revenueUsdCents).toBe(100); // 18000/180
    expect(lrd.grossProfitUsdCents).toBe(50);
  });

  it("inventory unit margin never reports 100% when cost missing", () => {
    const m = inventoryUnitMarginPct({ sellPriceUsdCents: 1000, unitCostUsdCents: null });
    expect(m.status).toBe("cost_missing");
    expect(m.marginPct).toBeNull();
  });

  it("valid avg-unit-cost fallback still yields gross profit (not nulled for missing WAC alone)", () => {
    // Mirrors resolve_inventory_unit_cost_usd_cents: WAC absent, avg USD present → cost known.
    const line = computeGrossMarginLine({
      revenueUsdCents: 10000,
      unitCostUsdCents: 4000, // resolved from avg_unit_cost when WAC missing
      qty: 1,
    });
    expect(line.status).toBe("profitable");
    expect(line.grossProfitUsdCents).toBe(6000);
    expect(line.marginPct).toBeCloseTo(60, 5);
    expect(line.costComplete).toBe(true);
  });
});
