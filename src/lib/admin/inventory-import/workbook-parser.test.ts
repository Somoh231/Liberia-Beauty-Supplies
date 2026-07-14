import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportCommitPlan } from "@/lib/admin/inventory-import/row-overrides";
import { parseInventoryWorkbookBuffer } from "@/lib/admin/inventory-import/workbook-parser";
import {
  EXCLUDED_IMPORT_CATEGORIES,
  EXPECTED_CATALOG_CATEGORY_COUNT,
  EXPECTED_CATALOG_PRODUCT_COUNTS,
  EXPECTED_CATALOG_PRODUCT_TOTAL,
  EXPECTED_IMPORT_CATEGORIES,
} from "@/lib/admin/inventory-import/types";
import { normalizeSheetName } from "@/lib/admin/inventory-import/parse-utils";

/** Stable repo fixture — do not fall back to Downloads or skip. */
export const WORKBOOK_FIXTURE_PATH = path.join(
  process.cwd(),
  "fixtures/Final_Master_Inventory_Workbook.xlsx",
);

function loadWorkbookFixture(): ArrayBuffer {
  if (!existsSync(WORKBOOK_FIXTURE_PATH)) {
    throw new Error(
      [
        "Missing required workbook fixture.",
        `Place the real file at: ${WORKBOOK_FIXTURE_PATH}`,
        "Source copy used for this project: /Users/mo/Downloads/Final_Master_Inventory_Workbook (1).xlsx",
        'Example: mkdir -p fixtures && cp "/Users/mo/Downloads/Final_Master_Inventory_Workbook (1).xlsx" fixtures/Final_Master_Inventory_Workbook.xlsx',
      ].join("\n"),
    );
  }
  const buf = readFileSync(WORKBOOK_FIXTURE_PATH);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("catalog workbook parser", () => {
  it("excludes Dummy Heads and keeps eight categories", () => {
    expect(EXPECTED_IMPORT_CATEGORIES).toHaveLength(8);
    expect(EXPECTED_IMPORT_CATEGORIES).not.toContain("Dummy Heads");
    expect(EXCLUDED_IMPORT_CATEGORIES).toContain("Dummy Heads");
    expect(EXPECTED_CATALOG_PRODUCT_TOTAL).toBe(177);
  });

  it("trims sheet names so trailing-space Dummy Heads / List of Hair Products still match", () => {
    expect(normalizeSheetName("Dummy Heads ")).toBe("Dummy Heads");
    expect(normalizeSheetName("List of Hair Products ")).toBe("List of Hair Products");
    expect(EXCLUDED_IMPORT_CATEGORIES.includes(normalizeSheetName("Dummy Heads ") as "Dummy Heads")).toBe(
      true,
    );
    expect(EXPECTED_IMPORT_CATEGORIES.includes(normalizeSheetName("List of Hair Products ") as never)).toBe(
      true,
    );
  });

  it("parses the real fixture as catalog-only with exact counts", () => {
    const buffer = loadWorkbookFixture();
    const report = parseInventoryWorkbookBuffer(buffer, "Final_Master_Inventory_Workbook.xlsx", undefined, "catalog");

    expect(report.mode).toBe("catalog");
    expect(report.summary.missingExpectedSheets).toEqual([]);
    expect(report.summary.unknownSheets).toEqual([]);

    // Trailing-space Dummy Heads sheet is excluded (raw name still recorded)
    expect(report.summary.excludedSheets.some((s) => normalizeSheetName(s) === "Dummy Heads")).toBe(true);
    expect(report.summary.excludedSheets.some((s) => s.endsWith(" ") || s === "Dummy Heads ")).toBe(true);

    expect(report.categorySummaries).toHaveLength(EXPECTED_CATALOG_CATEGORY_COUNT);
    expect(report.summary.totalRows).toBe(EXPECTED_CATALOG_PRODUCT_TOTAL);
    expect(report.summary.importable).toBe(EXPECTED_CATALOG_PRODUCT_TOTAL);

    const byCat = Object.fromEntries(report.categorySummaries.map((c) => [c.category, c.totalRows]));
    for (const cat of EXPECTED_IMPORT_CATEGORIES) {
      expect(byCat[cat], cat).toBe(EXPECTED_CATALOG_PRODUCT_COUNTS[cat]);
    }

    // No products from Dummy Heads sheet; zero "Big Dummy*" rows
    expect(report.rows.every((r) => r.category !== "Dummy Heads")).toBe(true);
    expect(report.rows.every((r) => !/Big Dummy/i.test(r.productName))).toBe(true);

    // Exactly one Dummy Head — under Lash Extension
    const dummyHeads = report.rows.filter((r) => r.productName.trim() === "Dummy Head");
    expect(dummyHeads).toHaveLength(1);
    expect(dummyHeads[0]?.category).toBe("Lash Extension");

    // Multi-table sheets
    expect(byCat["Hair & Salon Equipment"]).toBe(14);
    expect(byCat.Microblading).toBe(23);
    expect(report.rows.some((r) => r.productName === "Pink Nail Table")).toBe(true);
    expect(report.rows.some((r) => /Industrial Machine/i.test(r.productName))).toBe(true);

    // All parsed names are trimmed; no financial fields from spreadsheet
    for (const row of report.rows) {
      expect(row.productName).toBe(row.productName.trim());
      expect(row.productName.length).toBeGreaterThan(0);
      expect(row.quantity).toBeNull();
      expect(row.retailNgnMajor).toBeNull();
      expect(row.retailNgnCents).toBeNull();
      expect(row.derivedSellUsdCents).toBeNull();
      expect(row.derivedSellLrdCents).toBeNull();
      expect(row.raw).not.toHaveProperty("quantity");
      expect(row.raw).not.toHaveProperty("retail_ngn");
      expect(row.raw).not.toHaveProperty("total_ngn");
      expect(row.raw).not.toHaveProperty("rate_calculation");
    }
  });

  it("fails loudly when expected sheets are missing or an unexpected sheet appears", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["S/N", "Name"], [1, "X"]]), "Human Hair");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["A"]]), "Mystery Sheet");
    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const bytes = new Uint8Array(out);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(() => parseInventoryWorkbookBuffer(buffer, "bad.xlsx")).toThrow(
      /Missing expected workbook sheet|Unexpected workbook sheet/i,
    );
  });
});

describe("catalog seed commit plan", () => {
  it("builds qty-0 / null-financial payloads with needs_setup + retail item_type", () => {
    const buffer = loadWorkbookFixture();
    const report = parseInventoryWorkbookBuffer(buffer, "Final_Master_Inventory_Workbook.xlsx", undefined, "catalog");
    const plan = buildImportCommitPlan(report, {});

    expect(plan.catalogOnly).toBe(true);
    expect(plan.importRows).toHaveLength(EXPECTED_CATALOG_PRODUCT_TOTAL);

    for (const row of plan.importRows) {
      expect(row.quantity).toBe(0);
      expect(row.retail_ngn_cents).toBeNull();
      expect(row.sell_usd_cents).toBeNull();
      expect(row.sell_lrd_cents).toBeNull();
      expect(row.catalog_only).toBe(true);
      expect(row.setup_status).toBe("needs_setup");
      expect(row.item_type === "retail" || row.item_type === "asset").toBe(true);
      expect(row.product_name).toBe(row.product_name.trim());
      // No spreadsheet financial columns in payload
      expect(row).not.toHaveProperty("rate");
      expect(row).not.toHaveProperty("total");
      expect(row).not.toHaveProperty("wac");
      expect(row).not.toHaveProperty("cost");
    }

    expect(plan.importRows.filter((r) => r.product_name === "Dummy Head")).toHaveLength(1);
    expect(plan.importRows.find((r) => r.product_name === "Dummy Head")?.category).toBe("Lash Extension");
    expect(plan.importRows.every((r) => !/Big Dummy/i.test(r.product_name))).toBe(true);

    const pink = plan.importRows.find((r) => r.product_name === "Pink Nail Table");
    expect(pink?.item_type).toBe("asset");
    expect(pink?.setup_status).toBe("needs_setup");
    const industrial = plan.importRows.find((r) => /Industrial Machine/i.test(r.product_name));
    expect(industrial?.item_type).toBe("asset");
    const regular = plan.importRows.find((r) => r.product_name === "Dummy Head");
    expect(regular?.item_type).toBe("retail");
    expect(regular?.setup_status).toBe("needs_setup");
  });

  it("skips duplicate category+lower(name) instead of duplicating", () => {
    const buffer = loadWorkbookFixture();
    const report = parseInventoryWorkbookBuffer(buffer, "Final_Master_Inventory_Workbook.xlsx", undefined, "catalog");
    // Inject a duplicate
    const clone = { ...report.rows[0]!, id: "dup-test", productName: report.rows[0]!.productName };
    const withDup = { ...report, rows: [...report.rows, clone] };
    const plan = buildImportCommitPlan(withDup, {});
    expect(plan.importRows).toHaveLength(EXPECTED_CATALOG_PRODUCT_TOTAL);
    expect(plan.skippedCount).toBeGreaterThanOrEqual(1);
    expect(plan.unresolvedRows.some((r) => r.validation_status === "duplicate_skipped")).toBe(true);
  });
});
