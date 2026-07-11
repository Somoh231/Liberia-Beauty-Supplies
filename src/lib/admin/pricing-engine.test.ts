import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATIONAL_LRD_PER_USD,
  DEFAULT_OPERATIONAL_NGN_PER_USD,
  convertLrdCentsToUsdCents,
  convertUsdCentsToLrdCents,
  inventoryNeedsSetup,
  lineRevenueUsdEquivCents,
  ngnKoboToUsdCents,
  resolveOperationalFxFromSettings,
  saleLineFinancialPreview,
  usdCentsToNgnKobo,
} from "@/lib/admin/pricing-engine";

describe("canonical FX contract", () => {
  const ngn = DEFAULT_OPERATIONAL_NGN_PER_USD;
  const lrd = DEFAULT_OPERATIONAL_LRD_PER_USD;

  it("₦1,385 → $1.00", () => {
    expect(ngnKoboToUsdCents(1385 * 100, ngn)).toBe(100);
  });

  it("₦13,850 → $10.00", () => {
    expect(ngnKoboToUsdCents(13850 * 100, ngn)).toBe(1000);
  });

  it("₦21,000 → approximately $15.16", () => {
    expect(ngnKoboToUsdCents(21000 * 100, ngn)).toBe(1516);
  });

  it("$10.00 → ₦13,850", () => {
    expect(usdCentsToNgnKobo(1000, ngn)).toBe(13850 * 100);
  });

  it("$10.00 → LD 1,900", () => {
    expect(convertUsdCentsToLrdCents(1000, lrd)).toBe(1900 * 100);
  });

  it("LD 1,900 → $10.00", () => {
    expect(convertLrdCentsToUsdCents(1900 * 100, lrd)).toBe(1000);
  });

  it("handles zero values", () => {
    expect(ngnKoboToUsdCents(0, ngn)).toBe(0);
    expect(convertUsdCentsToLrdCents(0, lrd)).toBe(0);
    expect(convertLrdCentsToUsdCents(0, lrd)).toBe(0);
    expect(usdCentsToNgnKobo(0, ngn)).toBe(0);
  });

  it("rejects invalid negative / non-positive FX", () => {
    expect(ngnKoboToUsdCents(-100, ngn)).toBe(0);
    expect(convertUsdCentsToLrdCents(-100, lrd)).toBe(0);
    expect(convertLrdCentsToUsdCents(190000, 0)).toBe(0);
    expect(convertLrdCentsToUsdCents(190000, -1)).toBe(0);
    expect(usdCentsToNgnKobo(1000, 0)).toBe(0);
  });

  it("settings override wins over baseline", () => {
    const rates = resolveOperationalFxFromSettings({ ngn_per_usd: 1400, lrd_per_usd: 200 });
    expect(rates.ngnPerUsd).toBe(1400);
    expect(rates.lrdPerUsd).toBe(200);
    expect(ngnKoboToUsdCents(1400 * 100, rates.ngnPerUsd)).toBe(100);
    expect(convertUsdCentsToLrdCents(1000, rates.lrdPerUsd)).toBe(2000 * 100);
  });

  it("missing settings fall back to official baseline", () => {
    const rates = resolveOperationalFxFromSettings(null);
    expect(rates.ngnPerUsd).toBe(1385);
    expect(rates.lrdPerUsd).toBe(190);
    const invalid = resolveOperationalFxFromSettings({ ngn_per_usd: 0, lrd_per_usd: -5 });
    expect(invalid.ngnPerUsd).toBe(1385);
    expect(invalid.lrdPerUsd).toBe(190);
  });

  it("large-value rounding stays stable", () => {
    // ₦21_000_000 → $15,162.45 → 1,516,245 cents
    expect(ngnKoboToUsdCents(21_000_000 * 100, ngn)).toBe(1_516_245);
    expect(convertUsdCentsToLrdCents(1_000_000, lrd)).toBe(190_000_000);
  });
});

describe("sale line revenue / GP", () => {
  it("LRD line revenue matches SQL contract", () => {
    // 1 × LD 1,900
    expect(lineRevenueUsdEquivCents(1900 * 100, 1, "LRD")).toBe(1000);
  });

  it("preserves negative gross profit", () => {
    const preview = saleLineFinancialPreview({
      qty: 1,
      unitPriceCents: 500,
      currency: "USD",
      wacUsdCentsPerUnit: 800,
    });
    expect(preview.revenueUsdCents).toBe(500);
    expect(preview.grossProfitUsdCents).toBe(-300);
  });
});

describe("inventoryNeedsSetup", () => {
  it("flags clean catalog seed rows", () => {
    expect(
      inventoryNeedsSetup({
        quantity_on_hand: 0,
        avg_unit_cost_cents: 0,
        weighted_avg_landed_usd_cents: 0,
        sell_price_usd_cents: null,
        sell_price_lrd_cents: null,
        supplier_id: null,
      }),
    ).toBe(true);
  });

  it("clears when retail or qty present", () => {
    expect(inventoryNeedsSetup({ quantity_on_hand: 2, avg_unit_cost_cents: 0 })).toBe(false);
    expect(inventoryNeedsSetup({ quantity_on_hand: 0, sell_price_usd_cents: 1000 })).toBe(false);
  });
});
