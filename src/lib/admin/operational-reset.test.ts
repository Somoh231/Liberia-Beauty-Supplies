import { describe, expect, it } from "vitest";
import {
  LEGACY_PRODUCT_SALE_TABLE_MAPPING,
  OPERATIONAL_RESET_CONFIRM_PHRASE,
  OPERATIONAL_RESET_DELETE_ORDER,
  OPERATIONAL_RESET_OPTIONAL_LEGACY_TABLES,
  OPERATIONAL_RESET_PARENT_AFTER_CHILDREN,
  assertWipeCountsAreZero,
  canEnableOperationalReset,
  formatForeignKeyViolationError,
  isExactResetConfirmation,
  mapOperationalResetError,
  simulateOperationalReset,
  wipeCountsWithOptionalTablesAbsent,
  type OperationalResetWipeCounts,
  type SimulatedResetDataset,
} from "@/lib/admin/operational-reset";

function sampleDataset(): SimulatedResetDataset {
  return {
    wipe: {
      sales_edit_log: [1, 2],
      inventory_movements: [1],
      stock_movements: [1, 2],
      inventory_correction_log: [1],
      sale_items: [1],
      sales: [10, 11, 12],
      purchase_lines: [1],
      purchase_items: [1, 2, 3],
      purchase_invoices: [1],
      purchases: [1],
      weekly_product_sales: [1, 2],
      weekly_log_product_lines: [1],
      weekly_log_service_lines: [1],
      weekly_logs: [1],
      inventory_import_batches: [1],
      inventory_items: [1, 2, 3],
      daily_cash_reconciliations: [1],
      "service_logs.product_usage_clear": [],
    },
    service_logs: [
      { id: "s1", product_usage: [{ inventory_item_id: "i1", qty: 1 }], revenue: 5000 },
      { id: "s2", product_usage: [], revenue: 2000 },
    ],
    preserved: {
      user_profiles: 3,
      suppliers: 4,
      service_logs: 2,
      space_lease_payments: 1,
      operational_settings: 1,
      weekly_sales_reports: 2,
      weekly_service_sales: 5,
    },
  };
}

describe("operational hard reset contracts", () => {
  it("uses the exact confirmation phrase", () => {
    expect(OPERATIONAL_RESET_CONFIRM_PHRASE).toBe("RESET SALES AND INVENTORY");
    expect(isExactResetConfirmation("RESET SALES AND INVENTORY")).toBe(true);
    expect(isExactResetConfirmation("reset sales and inventory")).toBe(false);
    expect(isExactResetConfirmation(" RESET SALES AND INVENTORY ")).toBe(true);
  });

  it("maps legacy product-sale rows to weekly_product_sales", () => {
    expect(LEGACY_PRODUCT_SALE_TABLE_MAPPING.actualTable).toBe("weekly_product_sales");
    expect(LEGACY_PRODUCT_SALE_TABLE_MAPPING.preservedSiblingTables).toContain("weekly_sales_reports");
    expect(LEGACY_PRODUCT_SALE_TABLE_MAPPING.preservedSiblingTables).toContain("weekly_service_sales");
  });

  it("documents FK-safe delete order with legacy child tables before parents", () => {
    expect([...OPERATIONAL_RESET_DELETE_ORDER]).toEqual([
      "sales_edit_log",
      "inventory_movements",
      "stock_movements",
      "inventory_correction_log",
      "sale_items",
      "sales",
      "purchase_lines",
      "purchase_items",
      "purchase_invoices",
      "purchases",
      "weekly_product_sales",
      "weekly_log_product_lines",
      "weekly_log_service_lines",
      "weekly_logs",
      "inventory_import_batches",
      "inventory_items",
      "daily_cash_reconciliations",
      "service_logs.product_usage_clear",
    ]);

    const idx = (name: (typeof OPERATIONAL_RESET_DELETE_ORDER)[number]) =>
      OPERATIONAL_RESET_DELETE_ORDER.indexOf(name);

    for (const child of OPERATIONAL_RESET_PARENT_AFTER_CHILDREN.inventory_items) {
      expect(idx(child as (typeof OPERATIONAL_RESET_DELETE_ORDER)[number])).toBeLessThan(idx("inventory_items"));
    }
    for (const child of OPERATIONAL_RESET_PARENT_AFTER_CHILDREN.sales) {
      expect(idx(child as (typeof OPERATIONAL_RESET_DELETE_ORDER)[number])).toBeLessThan(idx("sales"));
    }
    for (const child of OPERATIONAL_RESET_PARENT_AFTER_CHILDREN.purchases) {
      expect(idx(child as (typeof OPERATIONAL_RESET_DELETE_ORDER)[number])).toBeLessThan(idx("purchases"));
    }
  });

  it("requires preview, backup, phrase, and reauth before enable", () => {
    expect(
      canEnableOperationalReset({
        hasPreview: true,
        backupConfirmed: true,
        confirmation: OPERATIONAL_RESET_CONFIRM_PHRASE,
        reauthChallengeId: "chal-1",
        pending: false,
      }),
    ).toBe(true);

    expect(
      canEnableOperationalReset({
        hasPreview: true,
        backupConfirmed: true,
        confirmation: "WRONG",
        reauthChallengeId: "chal-1",
        pending: false,
      }),
    ).toBe(false);

    expect(
      canEnableOperationalReset({
        hasPreview: true,
        backupConfirmed: true,
        confirmation: OPERATIONAL_RESET_CONFIRM_PHRASE,
        reauthChallengeId: null,
        pending: false,
      }),
    ).toBe(false);

    expect(
      canEnableOperationalReset({
        hasPreview: true,
        backupConfirmed: false,
        confirmation: OPERATIONAL_RESET_CONFIRM_PHRASE,
        reauthChallengeId: "chal-1",
        pending: false,
      }),
    ).toBe(false);
  });

  it("exposes specific RPC errors instead of a blind reset_failed", () => {
    expect(mapOperationalResetError("unauthorized")).toBe("forbidden_owner_required");
    expect(mapOperationalResetError("confirmation_mismatch")).toBe("confirmation_mismatch");
    expect(mapOperationalResetError("reauth_required")).toBe("reauth_required");
    expect(mapOperationalResetError("reset_incomplete: inventory_items, purchase_items")).toBe(
      "reset_incomplete: inventory_items, purchase_items",
    );
    expect(mapOperationalResetError("preserved_data_changed: before={} after={}")).toMatch(
      /^preserved_data_changed:/,
    );
    expect(
      mapOperationalResetError(
        'update or delete on table "inventory_items" violates foreign key constraint "purchase_items_product_id_fkey" on table "purchase_items"',
        "23503",
      ),
    ).toBe("foreign_key_violation:purchase_items:purchase_items_product_id_fkey");
    expect(
      formatForeignKeyViolationError(
        'violates foreign key constraint "stock_movements_inventory_item_id_fkey" on table "stock_movements"',
      ),
    ).toBe("foreign_key_violation:stock_movements:stock_movements_inventory_item_id_fkey");
  });

  it("empties wipe-scope tables including legacy FK blockers", () => {
    const initial = sampleDataset();
    const preservedBefore = { ...initial.preserved };
    const result = simulateOperationalReset(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const step of OPERATIONAL_RESET_DELETE_ORDER) {
      if (step === "service_logs.product_usage_clear") continue;
      expect(result.final.wipe[step]).toEqual([]);
    }

    expect(result.final.wipe.stock_movements).toEqual([]);
    expect(result.final.wipe.purchase_items).toEqual([]);
    expect(result.final.wipe.sale_items).toEqual([]);
    expect(result.final.wipe.purchase_invoices).toEqual([]);
    expect(result.final.wipe.weekly_log_product_lines).toEqual([]);
    expect(result.final.service_logs).toHaveLength(2);
    expect(result.final.service_logs.every((s) => s.product_usage.length === 0)).toBe(true);
    expect(result.final.service_logs.map((s) => s.revenue)).toEqual([5000, 2000]);
    expect(result.final.preserved).toEqual(preservedBefore);

    const zero: OperationalResetWipeCounts = {
      sales_edit_log: 0,
      inventory_movements: 0,
      stock_movements: 0,
      inventory_correction_log: 0,
      sale_items: 0,
      sales: 0,
      purchase_lines: 0,
      purchase_items: 0,
      purchase_invoices: 0,
      purchases: 0,
      weekly_product_sales: 0,
      weekly_log_product_lines: 0,
      weekly_log_service_lines: 0,
      weekly_logs: 0,
      inventory_import_batches: 0,
      inventory_items: 0,
      daily_cash_reconciliations: 0,
      service_logs_with_product_usage: result.final.service_logs.filter((s) => s.product_usage.length > 0).length,
    };
    expect(assertWipeCountsAreZero(zero)).toBe(true);
  });

  it("rolls back fully when a mid-delete failure is forced (transactionality)", () => {
    const initial = sampleDataset();
    const result = simulateOperationalReset(initial, { failAfterStep: "sales_edit_log" });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe("forced_test_failure");
    expect(result.rolledBack.wipe.sales_edit_log).toEqual([1, 2]);
    expect(result.rolledBack.wipe.sales).toEqual([10, 11, 12]);
    expect(result.rolledBack.wipe.stock_movements).toEqual([1, 2]);
    expect(result.rolledBack.wipe.purchase_items).toEqual([1, 2, 3]);
    expect(result.rolledBack.wipe.sale_items).toEqual([1]);
    expect(result.rolledBack.wipe.purchase_invoices).toEqual([1]);
    expect(result.rolledBack.wipe.weekly_logs).toEqual([1]);
    expect(result.rolledBack.wipe.inventory_items).toEqual([1, 2, 3]);
    expect(result.rolledBack.service_logs[0]?.product_usage).toHaveLength(1);
    expect(result.rolledBack.preserved).toEqual(initial.preserved);
  });

  it("forced failure after purchase_items still restores legacy child tables", () => {
    const initial = sampleDataset();
    const result = simulateOperationalReset(initial, { failAfterStep: "purchase_items" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rolledBack.wipe.purchase_items).toEqual([1, 2, 3]);
    expect(result.rolledBack.wipe.purchase_invoices).toEqual([1]);
    expect(result.rolledBack.wipe.stock_movements).toEqual([1, 2]);
    expect(result.rolledBack.wipe.sale_items).toEqual([1]);
    expect(result.rolledBack.wipe.inventory_items.length).toBe(3);
  });

  it("treats missing optional legacy tables as zero counts (safe_table_count contract)", () => {
    const present = new Set<string>(); // none of the optional legacy tables exist
    const raw: OperationalResetWipeCounts = {
      sales_edit_log: 0,
      inventory_movements: 0,
      stock_movements: 99,
      inventory_correction_log: 0,
      sale_items: 42,
      sales: 0,
      purchase_lines: 0,
      purchase_items: 7,
      purchase_invoices: 3,
      purchases: 0,
      weekly_product_sales: 0,
      weekly_log_product_lines: 5,
      weekly_log_service_lines: 4,
      weekly_logs: 2,
      inventory_import_batches: 0,
      inventory_items: 0,
      daily_cash_reconciliations: 0,
      service_logs_with_product_usage: 0,
    };
    const coerced = wipeCountsWithOptionalTablesAbsent(raw, present);
    expect(coerced.sale_items).toBe(0);
    expect(coerced.stock_movements).toBe(0);
    expect(coerced.purchase_items).toBe(0);
    expect(coerced.purchase_invoices).toBe(0);
    expect(coerced.weekly_logs).toBe(0);
    expect(assertWipeCountsAreZero(coerced)).toBe(true);

    // When optional tables ARE present, raw counts are preserved.
    const allPresent = new Set<string>([...OPERATIONAL_RESET_OPTIONAL_LEGACY_TABLES]);
    expect(wipeCountsWithOptionalTablesAbsent(raw, allPresent).sale_items).toBe(42);
  });

  it("documents optional legacy tables that require dynamic SQL", () => {
    expect([...OPERATIONAL_RESET_OPTIONAL_LEGACY_TABLES]).toEqual([
      "stock_movements",
      "sale_items",
      "purchase_items",
      "purchase_invoices",
      "weekly_log_product_lines",
      "weekly_log_service_lines",
      "weekly_logs",
    ]);
  });
});
