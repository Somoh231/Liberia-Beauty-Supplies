import { describe, expect, it, vi } from "vitest";
import {
  paginateUntilExhausted,
  SALES_LOG_TOTALS_PAGE_SIZE,
} from "@/lib/admin/sales-log-paginate";
import { summarizeFilteredSalesLog } from "@/lib/admin/sales-log-filtered-totals";

describe("paginateUntilExhausted", () => {
  it("collects more than 5,000 matching rows without silent truncation", async () => {
    const totalRows = 5500;
    const pageSize = 1000;
    const fetchPage = vi.fn(async (from: number, to: number) => {
      const out: number[] = [];
      for (let i = from; i <= to && i < totalRows; i++) out.push(i);
      return out;
    });

    const result = await paginateUntilExhausted(fetchPage, { pageSize, maxRows: 100_000 });
    expect(result.incomplete).toBe(false);
    expect(result.rows).toHaveLength(5500);
    expect(result.rows[0]).toBe(0);
    expect(result.rows[5499]).toBe(5499);
    // 6 full-ish pages: 0-999 … 5000-5499
    expect(fetchPage.mock.calls.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps display-limit concerns separate from totals pagination", async () => {
    const displayLimit = 80;
    const totals = await paginateUntilExhausted(
      async (from, to) => {
        const out: { id: number }[] = [];
        for (let i = from; i <= to && i < 250; i++) out.push({ id: i });
        return out;
      },
      { pageSize: SALES_LOG_TOTALS_PAGE_SIZE },
    );
    expect(totals.rows).toHaveLength(250);
    expect(totals.incomplete).toBe(false);
    const displayRows = totals.rows.slice(0, displayLimit);
    expect(displayRows).toHaveLength(displayLimit);
    expect(totals.rows.length).toBeGreaterThan(displayLimit);
  });

  it("marks incomplete only when safety ceiling is exceeded", async () => {
    const result = await paginateUntilExhausted(
      async (from, to) => {
        // Unbounded source: every requested range is full, including the probe past maxRows.
        const out: number[] = [];
        for (let i = from; i <= to; i++) out.push(i);
        return out;
      },
      { pageSize: 100, maxRows: 200 },
    );
    expect(result.rows).toHaveLength(200);
    expect(result.incomplete).toBe(true);
  });

  it("exact-at-ceiling with no extra rows remains complete", async () => {
    const totalRows = 200;
    const result = await paginateUntilExhausted(
      async (from, to) => {
        const out: number[] = [];
        for (let i = from; i <= to && i < totalRows; i++) out.push(i);
        return out;
      },
      { pageSize: 100, maxRows: 200 },
    );
    expect(result.rows).toHaveLength(200);
    expect(result.incomplete).toBe(false);
  });
});

describe("filtered totals exactness with large sets", () => {
  it("summarizes all matching rows after pagination (not a 5k cap)", () => {
    const retail = Array.from({ length: 5200 }, () => ({
      qty: 1,
      unit_price_cents: 100,
      unit_cost_cents: 40,
      currency: "USD" as const,
      revenue_usd_equiv_cents: 100,
    }));
    const totals = summarizeFilteredSalesLog({
      retail,
      services: [],
      rentals: [],
      source: "retail",
    });
    expect(totals.retailCount).toBe(5200);
    expect(totals.retailUsdCents).toBe(5200 * 100);
    expect(totals.retailGrossProfitUsdCents).toBe(5200 * 60);
  });
});
