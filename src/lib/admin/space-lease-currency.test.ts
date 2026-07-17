import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  aggregateSpaceLeaseUsd,
  resolveSpaceLeaseCurrencyFields,
  simulateHistoricalSpaceLeaseBackfill,
  simulateSpaceLeaseCurrencyEdit,
  spaceLeaseUsdEquivCents,
} from "@/lib/admin/space-lease-currency";
import { isEditableSalesLogSource } from "@/lib/admin/sales-log-edit";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260607120000_space_lease_payment_currency_and_margin.sql",
);

describe("space lease USD/LRD currency", () => {
  it("USD payment stores original and equivalent correctly", () => {
    const r = resolveSpaceLeaseCurrencyFields({
      amountCents: 10000,
      currency: "USD",
      lrdPerUsd: 180,
    });
    expect(r).toEqual({
      ok: true,
      currency: "USD",
      amountCents: 10000,
      amountUsdEquivCents: 10000,
      fxLrdPerUsd: null,
    });
  });

  it("LRD payment stores original, FX snapshot, and USD equivalent", () => {
    const r = resolveSpaceLeaseCurrencyFields({
      amountCents: 500_000, // L$5,000.00
      currency: "LRD",
      lrdPerUsd: 180,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amountCents).toBe(500_000);
    expect(r.currency).toBe("LRD");
    expect(r.fxLrdPerUsd).toBe(180);
    expect(r.amountUsdEquivCents).toBe(Math.round(500_000 / 180));
  });

  it("new USD/LRD writes always receive valid equivalents", () => {
    const usd = resolveSpaceLeaseCurrencyFields({ amountCents: 2500, currency: "USD", lrdPerUsd: 190 });
    const lrd = resolveSpaceLeaseCurrencyFields({ amountCents: 19000, currency: "LRD", lrdPerUsd: 190 });
    expect(usd).toMatchObject({ ok: true, amountUsdEquivCents: 2500 });
    expect(lrd).toMatchObject({ ok: true, amountUsdEquivCents: 100, fxLrdPerUsd: 190 });
  });

  it("USD → LRD and LRD → USD edits recalculate in place without changing id", () => {
    const existing = {
      id: "lease-1",
      amount_cents: 10000,
      currency: "USD",
      amount_usd_equiv_cents: 10000,
      fx_lrd_per_usd: null,
      created_at: "2026-07-01T00:00:00.000Z",
    };
    const toLrd = simulateSpaceLeaseCurrencyEdit(existing, {
      amountCents: 500_000,
      currency: "LRD",
      lrdPerUsd: 180,
    });
    expect(toLrd.ok).toBe(true);
    if (!toLrd.ok) return;
    expect(toLrd.id).toBe("lease-1");
    expect(toLrd.created_at).toBe(existing.created_at);
    expect(toLrd.currency).toBe("LRD");
    expect(toLrd.amount_usd_equiv_cents).toBe(Math.round(500_000 / 180));

    const toUsd = simulateSpaceLeaseCurrencyEdit(
      {
        ...existing,
        amount_cents: toLrd.amount_cents,
        currency: toLrd.currency,
        amount_usd_equiv_cents: toLrd.amount_usd_equiv_cents,
        fx_lrd_per_usd: toLrd.fx_lrd_per_usd,
      },
      { amountCents: 12000, currency: "USD", lrdPerUsd: 180 },
    );
    expect(toUsd.ok).toBe(true);
    if (!toUsd.ok) return;
    expect(toUsd.id).toBe("lease-1");
    expect(toUsd.amount_cents).toBe(12000);
    expect(toUsd.amount_usd_equiv_cents).toBe(12000);
    expect(toUsd.fx_lrd_per_usd).toBeNull();
  });

  it("historical LRD/NGN rows are not assigned current FX; missing conversion stays null", () => {
    const before = [
      { amount_cents: 10000, currency: "USD", amount_usd_equiv_cents: null, fx_lrd_per_usd: null },
      { amount_cents: 500_000, currency: "LRD", amount_usd_equiv_cents: null, fx_lrd_per_usd: null },
      { amount_cents: 200_000, currency: "NGN", amount_usd_equiv_cents: null, fx_lrd_per_usd: null },
    ];
    const after = simulateHistoricalSpaceLeaseBackfill(before);
    expect(after[0]).toMatchObject({
      currency: "USD",
      amount_usd_equiv_cents: 10000,
      fx_lrd_per_usd: null,
    });
    expect(after[1]).toMatchObject({
      currency: "LRD",
      amount_usd_equiv_cents: null,
      fx_lrd_per_usd: null,
    });
    expect(after[2]).toMatchObject({
      currency: "NGN",
      amount_usd_equiv_cents: null,
      fx_lrd_per_usd: null,
    });
    expect(spaceLeaseUsdEquivCents(after[1]!)).toBeNull();
    expect(spaceLeaseUsdEquivCents(after[2]!)).toBeNull();
  });

  it("combined USD totals exclude unknown conversions and disclose incomplete coverage", () => {
    const rows = [
      { amount_cents: 10000, currency: "USD", amount_usd_equiv_cents: 10000, fx_lrd_per_usd: null },
      { amount_cents: 500_000, currency: "LRD", amount_usd_equiv_cents: null, fx_lrd_per_usd: null },
      { amount_cents: 2778, currency: "LRD", amount_usd_equiv_cents: 2778, fx_lrd_per_usd: 180 },
    ];
    const cov = aggregateSpaceLeaseUsd(rows);
    expect(cov.usdTotalCents).toBe(10000 + 2778);
    expect(cov.usdTotalCents).not.toBe(10000 + 500_000 + 2778);
    expect(cov.rowsTotal).toBe(3);
    expect(cov.rowsWithUsd).toBe(2);
    expect(cov.rowsConversionUnavailable).toBe(1);
    expect(cov.isPartial).toBe(true);
    expect(cov.coverageLabel).toBe("USD conversion available for 2 of 3 rental payments");
  });

  it("rejects unsupported currency, invalid amount, and missing FX for LRD", () => {
    expect(resolveSpaceLeaseCurrencyFields({ amountCents: 100, currency: "NGN", lrdPerUsd: 180 })).toMatchObject({
      ok: false,
      error: "unsupported_currency",
    });
    expect(resolveSpaceLeaseCurrencyFields({ amountCents: 0, currency: "USD", lrdPerUsd: 180 })).toMatchObject({
      ok: false,
      error: "invalid_amount",
    });
    expect(resolveSpaceLeaseCurrencyFields({ amountCents: -5, currency: "USD", lrdPerUsd: 180 })).toMatchObject({
      ok: false,
      error: "invalid_amount",
    });
    expect(resolveSpaceLeaseCurrencyFields({ amountCents: 1000, currency: "LRD", lrdPerUsd: 0 })).toMatchObject({
      ok: false,
      error: "invalid_fx_rate",
    });
    expect(resolveSpaceLeaseCurrencyFields({ amountCents: 1000, currency: "LRD", lrdPerUsd: null })).toMatchObject({
      ok: false,
      error: "invalid_fx_rate",
    });
    expect(resolveSpaceLeaseCurrencyFields({ amountCents: 1000, currency: "", lrdPerUsd: 180 })).toMatchObject({
      ok: false,
      error: "invalid_currency",
    });
  });

  it("existing USD records remain compatible and weekly summaries stay non-authoritative", () => {
    expect(
      spaceLeaseUsdEquivCents({
        amount_cents: 5000,
        currency: "USD",
        amount_usd_equiv_cents: null,
        fx_lrd_per_usd: null,
      }),
    ).toBe(5000);
    expect(isEditableSalesLogSource("weekly_stylist_space_payments")).toBe(false);
    expect(isEditableSalesLogSource("weekly_sales_reports")).toBe(false);
  });

  it("migration: USD-only backfill, no default 0, no historical LRD/NGN FX invention", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const executable = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");

    expect(executable).toMatch(/amount_usd_equiv_cents/);
    expect(executable).toMatch(/fx_lrd_per_usd/);
    expect(executable).toMatch(/trg_space_lease_payments_set_usd_equiv/);
    expect(executable).toMatch(/alter column amount_usd_equiv_cents drop default/i);
    expect(executable).not.toMatch(/alter column amount_usd_equiv_cents set default 0/i);

    // USD backfill only
    expect(executable).toMatch(/where currency = 'USD'/i);
    // Must not invent historical LRD/NGN conversion from operational rates
    expect(executable).not.toMatch(
      /update public\.space_lease_payments[\s\S]*where currency = 'LRD'[\s\S]*operational_lrd_per_usd/i,
    );
    expect(executable).not.toMatch(
      /update public\.space_lease_payments[\s\S]*where currency = 'NGN'[\s\S]*operational_ngn_per_usd/i,
    );

    expect(executable).toMatch(/resolve_inventory_unit_cost_usd_cents/);
    expect(executable).toMatch(/alter column unit_cost_cents drop not null/i);
    expect(executable).toMatch(/gross_profit_usd_cents := null/i);
    // Cost ladder includes avg_unit_cost fallback (not WAC-only)
    expect(executable).toMatch(/v_avg/);
    expect(executable).toMatch(/v_base := v_avg/);
  });
});
