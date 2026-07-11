import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInventoryWorkbookBuffer } from "@/lib/admin/inventory-import/workbook-parser";
import { EXCLUDED_IMPORT_CATEGORIES, EXPECTED_IMPORT_CATEGORIES } from "@/lib/admin/inventory-import/types";

const WORKBOOK_CANDIDATES = [
  "/Users/mo/Downloads/Final_Master_Inventory_Workbook (1).xlsx",
  "/Users/mo/Downloads/Final_Master_Inventory_Workbook.xlsx",
];

function loadWorkbookBuffer(): ArrayBuffer | null {
  for (const path of WORKBOOK_CANDIDATES) {
    try {
      const buf = readFileSync(path);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } catch {
      /* try next */
    }
  }
  return null;
}

describe("catalog workbook parser", () => {
  it("excludes Dummy Heads and keeps eight categories", () => {
    expect(EXPECTED_IMPORT_CATEGORIES).not.toContain("Dummy Heads");
    expect(EXCLUDED_IMPORT_CATEGORIES).toContain("Dummy Heads");
  });

  it("parses attached workbook as catalog-only names", () => {
    const buffer = loadWorkbookBuffer();
    if (!buffer) {
      console.warn("Workbook not found locally — skipping live parse assertions");
      return;
    }

    const report = parseInventoryWorkbookBuffer(buffer, "Final_Master_Inventory_Workbook.xlsx", undefined, "catalog");

    expect(report.mode).toBe("catalog");
    expect(report.summary.excludedSheets.some((s) => s.trim().toLowerCase().includes("dummy heads"))).toBe(true);
    expect(report.categorySummaries).toHaveLength(8);

    const byCat = Object.fromEntries(report.categorySummaries.map((c) => [c.category, c.importable]));
    expect(byCat["Human Hair"]).toBeGreaterThan(0);
    expect(byCat["List of Hair Products"]).toBeGreaterThan(0);
    expect(byCat["Lash Extension"]).toBeGreaterThan(0);

    // Dummy Heads sheet products must not appear
    expect(report.rows.every((r) => r.category !== "Dummy Heads")).toBe(true);

    // Lash Extension product “Dummy Head” retained if present
    const lashDummy = report.rows.find(
      (r) => r.category === "Lash Extension" && r.productName.trim().toLowerCase() === "dummy head",
    );
    expect(lashDummy).toBeTruthy();

    // No financial fields inferred
    for (const row of report.rows.filter((r) => !r.skipped)) {
      expect(row.retailNgnCents).toBeNull();
      expect(row.derivedSellUsdCents).toBeNull();
      expect(row.quantity).toBeNull();
    }

    expect(report.summary.importable).toBeGreaterThanOrEqual(170);
    expect(report.summary.importable).toBeLessThanOrEqual(185);
  });
});
