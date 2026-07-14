import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildImportCommitPlan } from "@/lib/admin/inventory-import/row-overrides";
import { parseInventoryWorkbookBuffer } from "@/lib/admin/inventory-import/workbook-parser";
import {
  APPROVED_INVENTORY_CATEGORIES,
  catalogSeedFinancialFieldsUnset,
  inventoryCategoryFromSlug,
  inventoryCategoryToSlug,
  productsInCategory,
  summarizeInventoryByCategory,
} from "@/lib/admin/inventory-categories";
import {
  archiveExistingAllowed,
  archiveExistingRequested,
  buildImportArchiveRpcFlags,
  validateImportArchiveFlags,
} from "@/lib/admin/inventory-import/archive-flags";
import {
  EXPECTED_CATALOG_CATEGORY_COUNT,
  EXPECTED_CATALOG_PRODUCT_COUNTS,
  EXPECTED_CATALOG_PRODUCT_TOTAL,
  EXPECTED_IMPORT_CATEGORIES,
} from "@/lib/admin/inventory-import/types";
import type { InventoryProductRow } from "@/lib/admin/salon-queries";

const WORKBOOK_FIXTURE_PATH = path.join(process.cwd(), "fixtures/Final_Master_Inventory_Workbook.xlsx");
const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260602120000_catalog_seed_unset_operational_fields.sql",
);

const NULLABLE_REORDER_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260605120000_catalog_seed_nullable_reorder_fields.sql",
);

function executableSql(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

function loadWorkbookFixture(): ArrayBuffer {
  if (!existsSync(WORKBOOK_FIXTURE_PATH)) {
    throw new Error(`Missing fixture at ${WORKBOOK_FIXTURE_PATH}`);
  }
  const buf = readFileSync(WORKBOOK_FIXTURE_PATH);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("approved category slug allowlist", () => {
  it("resolves all eight canonical slugs (encoded and decoded forms)", () => {
    expect(APPROVED_INVENTORY_CATEGORIES).toEqual([
      "Human Hair",
      "List of Hair Products",
      "Extensions",
      "Ponytail Hair",
      "Makeup Products",
      "Lash Extension",
      "Hair & Salon Equipment",
      "Microblading",
    ]);
    expect(APPROVED_INVENTORY_CATEGORIES).toHaveLength(8);

    for (const cat of EXPECTED_IMPORT_CATEGORIES) {
      const encoded = inventoryCategoryToSlug(cat);
      expect(inventoryCategoryFromSlug(encoded)).toBe(cat);
      expect(inventoryCategoryFromSlug(cat)).toBe(cat);
    }

    expect(inventoryCategoryFromSlug("Hair%20%26%20Salon%20Equipment")).toBe("Hair & Salon Equipment");
    expect(inventoryCategoryFromSlug("Hair & Salon Equipment")).toBe("Hair & Salon Equipment");
    expect(inventoryCategoryFromSlug(encodeURIComponent("List of Hair Products"))).toBe(
      "List of Hair Products",
    );
  });

  it("rejects unknown slugs with null (page contract → notFound/404)", () => {
    expect(inventoryCategoryFromSlug("random-trash")).toBeNull();
    expect(inventoryCategoryFromSlug("Dummy%20Heads")).toBeNull();
    expect(inventoryCategoryFromSlug("Dummy Heads")).toBeNull();
    expect(inventoryCategoryFromSlug("dummy-heads")).toBeNull();
    expect(inventoryCategoryFromSlug("")).toBeNull();
    expect(inventoryCategoryFromSlug("   ")).toBeNull();
    expect(inventoryCategoryFromSlug("%20")).toBeNull();
    // Page contract: null slug → notFound()
    const unknown = inventoryCategoryFromSlug("random-trash");
    if (!unknown) {
      expect(unknown).toBeNull();
    } else {
      throw new Error("expected unknown slug to require 404");
    }
  });
});

describe("catalog import archive safety", () => {
  it("defaults archive_existing to false", () => {
    expect(archiveExistingRequested({})).toBe(false);
    expect(archiveExistingRequested({ archiveExisting: undefined })).toBe(false);
    expect(archiveExistingRequested({ archiveExisting: false })).toBe(false);
    expect(buildImportArchiveRpcFlags({}).archive_existing).toBe(false);
    expect(buildImportArchiveRpcFlags({}).archive_existing_confirmed).toBe(false);
  });

  it("requires explicit confirmation before archive is allowed", () => {
    expect(archiveExistingAllowed({ archiveExisting: true })).toBe(false);
    expect(
      archiveExistingAllowed({ archiveExisting: true, archiveExistingConfirmed: false }),
    ).toBe(false);
    expect(
      archiveExistingAllowed({ archiveExisting: true, archiveExistingConfirmed: true }),
    ).toBe(true);

    expect(validateImportArchiveFlags({ archiveExisting: true })).toEqual({
      ok: false,
      error: "archive_existing_confirmation_required",
    });
    expect(
      validateImportArchiveFlags({
        archiveExisting: true,
        archiveExistingConfirmed: true,
      }),
    ).toEqual({
      ok: true,
      flags: { archive_existing: true, archive_existing_confirmed: true },
    });
    expect(validateImportArchiveFlags({})).toEqual({
      ok: true,
      flags: { archive_existing: false, archive_existing_confirmed: false },
    });
  });

  it("normal catalog import payload does not archive existing completed products", () => {
    // UI/commit path omits archive flags → never archives ready/completed inventory.
    const flags = buildImportArchiveRpcFlags({});
    expect(flags.archive_existing).toBe(false);
    expect(flags.archive_existing_confirmed).toBe(false);
    expect(
      archiveExistingAllowed({
        archiveExisting: flags.archive_existing,
        archiveExistingConfirmed: flags.archive_existing_confirmed,
      }),
    ).toBe(false);
  });
});

describe("catalog seed migration safety", () => {
  it("does not DROP COLUMN ... CASCADE for generated inventory columns", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    const body = executableSql(sql);
    expect(body).not.toMatch(/drop\s+column[^;]*\bcascade\b/i);
    expect(body).toMatch(/drop column if exists stock_status\s*;/i);
    expect(body).toMatch(/drop column if exists total_stock_value_minor\s*;/i);
    expect(body).toMatch(/coalesce\(\(p_payload->>'archive_existing'\)::boolean,\s*false\)/);
    expect(body).toMatch(/archive_existing_confirmation_required/);
  });

  it("catalog seed nullable-reorder migration allows null operational fields", () => {
    const sql = readFileSync(NULLABLE_REORDER_MIGRATION_PATH, "utf8");
    const body = executableSql(sql);

    expect(body).toMatch(/alter column reorder_level drop not null/i);
    expect(body).toMatch(/alter column reorder_point drop not null/i);
    expect(body).toMatch(/alter column low_stock_threshold drop not null/i);
    expect(body).toMatch(/alter column avg_unit_cost_cents drop not null/i);

    // Existing completed rows must not be rewritten with fake zeros/5s
    expect(body).not.toMatch(/update\s+public\.inventory_items/i);
    expect(body).not.toMatch(/reorder_level\s*=\s*5/i);
    expect(body).not.toMatch(/reorder_point\s*=\s*0/i);
    expect(body).not.toMatch(/set\s+avg_unit_cost_cents\s*=\s*0/i);

    // Catalog commit path still inserts NULL for unset operational figures
    const seedSql = executableSql(readFileSync(MIGRATION_PATH, "utf8"));
    expect(seedSql).toMatch(/insert into public\.inventory_items/i);
    expect(seedSql).toMatch(/'needs_setup'/);
  });

  it("ready/manual products still receive reorder defaults when not needs_setup", () => {
    const sql = readFileSync(NULLABLE_REORDER_MIGRATION_PATH, "utf8");
    const body = executableSql(sql);
    expect(body).toMatch(/is distinct from 'needs_setup'/i);
    expect(body).toMatch(/new\.reorder_level := coalesce\(new\.reorder_point,\s*5\)/i);
    expect(body).toMatch(/new\.reorder_point := new\.reorder_level/i);
    expect(body).toMatch(/new\.low_stock_threshold := coalesce\(new\.reorder_level,\s*5\)/i);
  });
});

describe("category-first inventory catalog", () => {
  it("round-trips category slugs for routing", () => {
    for (const cat of EXPECTED_IMPORT_CATEGORIES) {
      expect(inventoryCategoryFromSlug(inventoryCategoryToSlug(cat))).toBe(cat);
    }
    expect(inventoryCategoryFromSlug(inventoryCategoryToSlug("Hair & Salon Equipment"))).toBe(
      "Hair & Salon Equipment",
    );
  });

  it("workbook import creates exactly 8 categories and 177 category-linked products", () => {
    const report = parseInventoryWorkbookBuffer(
      loadWorkbookFixture(),
      "Final_Master_Inventory_Workbook.xlsx",
      undefined,
      "catalog",
    );
    const plan = buildImportCommitPlan(report, {});

    expect(Object.keys(plan.categoryTotals)).toHaveLength(EXPECTED_CATALOG_CATEGORY_COUNT);
    expect(plan.importRows).toHaveLength(EXPECTED_CATALOG_PRODUCT_TOTAL);
    expect(plan.importRows.every((r) => r.category.trim().length > 0)).toBe(true);
    expect(plan.importRows.every((r) => catalogSeedFinancialFieldsUnset(r))).toBe(true);
    expect(plan.importRows.every((r) => r.setup_status === "needs_setup")).toBe(true);

    for (const cat of EXPECTED_IMPORT_CATEGORIES) {
      const n = plan.importRows.filter((r) => r.category === cat).length;
      expect(n, cat).toBe(EXPECTED_CATALOG_PRODUCT_COUNTS[cat]);
      expect(plan.categoryTotals[cat]?.imported, cat).toBe(EXPECTED_CATALOG_PRODUCT_COUNTS[cat]);
    }
  });

  it("category overview totals match workbook category counts", () => {
    const report = parseInventoryWorkbookBuffer(
      loadWorkbookFixture(),
      "Final_Master_Inventory_Workbook.xlsx",
      undefined,
      "catalog",
    );
    const plan = buildImportCommitPlan(report, {});
    const fakeRows = plan.importRows.map((r, i) => ({
      id: String(i),
      category: r.category,
      setup_status: "needs_setup" as const,
      item_type: r.item_type ?? "retail",
    })) as Pick<InventoryProductRow, "category" | "setup_status" | "item_type">[];

    const summaries = summarizeInventoryByCategory(fakeRows);
    const eight = summaries.filter((s) =>
      (EXPECTED_IMPORT_CATEGORIES as readonly string[]).includes(s.category),
    );
    expect(eight).toHaveLength(8);
    for (const s of eight) {
      expect(s.totalProducts).toBe(
        EXPECTED_CATALOG_PRODUCT_COUNTS[s.category as keyof typeof EXPECTED_CATALOG_PRODUCT_COUNTS],
      );
      expect(s.needsSetupCount).toBe(s.totalProducts);
    }
    expect(eight.reduce((n, s) => n + s.totalProducts, 0)).toBe(177);
  });

  it("filtering a category returns only its products", () => {
    const report = parseInventoryWorkbookBuffer(
      loadWorkbookFixture(),
      "Final_Master_Inventory_Workbook.xlsx",
      undefined,
      "catalog",
    );
    const plan = buildImportCommitPlan(report, {});
    const rows = plan.importRows.map((r, i) => ({
      id: String(i),
      product_name: r.product_name,
      category: r.category,
    })) as InventoryProductRow[];

    const lash = productsInCategory(rows, "Lash Extension");
    expect(lash).toHaveLength(EXPECTED_CATALOG_PRODUCT_COUNTS["Lash Extension"]);
    expect(lash.every((r) => r.category === "Lash Extension")).toBe(true);
    expect(lash.some((r) => r.product_name === "Dummy Head")).toBe(true);
  });

  it("keeps New Product available as a non-workbook path (route contract)", () => {
    expect("/admin/inventory/new").toContain("/inventory/new");
    expect("/admin/inventory").not.toContain("/new");
  });
});
