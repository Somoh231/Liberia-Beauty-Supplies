import { describe, expect, it } from "vitest";
import {
  LEGACY_PRODUCT_SALE_TABLE_MAPPING,
  OPERATIONAL_RESET_CONFIRM_PHRASE,
  OPERATIONAL_RESET_DELETE_ORDER,
  assertWipeCountsAreZero,
  canEnableOperationalReset,
  isExactResetConfirmation,
  mapOperationalResetError,
  simulateOperationalReset,
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
      sales: [10, 11, 12],
      purchase_lines: [1],
      purchase_items: [1, 2, 3],
      purchases: [1],
      weekly_product_sales: [1, 2],
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

  it("documents FK-safe delete order including stock_movements and purchase_items", () => {
    expect([...OPERATIONAL_RESET_DELETE_ORDER]).toEqual([
      "sales_edit_log",
      "inventory_movements",
      "stock_movements",
      "inventory_correction_log",
      "sales",
      "purchase_lines",
      "purchase_items",
      "purchases",
      "weekly_product_sales",
      "inventory_import_batches",
      "inventory_items",
      "daily_cash_reconciliations",
      "service_logs.product_usage_clear",
    ]);

    expect(OPERATIONAL_RESET_DELETE_ORDER.indexOf("stock_movements")).toBeLessThan(
      OPERATIONAL_RESET_DELETE_ORDER.indexOf("inventory_items"),
    );
    expect(OPERATIONAL_RESET_DELETE_ORDER.indexOf("purchase_items")).toBeLessThan(
      OPERATIONAL_RESET_DELETE_ORDER.indexOf("inventory_items"),
    );
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

  it("maps non-owner and wrong-phrase RPC errors", () => {
    expect(mapOperationalResetError("unauthorized")).toBe("forbidden_owner_required");
    expect(mapOperationalResetError("confirmation_mismatch")).toBe("confirmation_mismatch");
    expect(mapOperationalResetError("reauth_required")).toBe("reauth_required");
  });

  it("empties wipe-scope tables including purchase_items and stock_movements", () => {
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
    expect(result.final.service_logs).toHaveLength(2);
    expect(result.final.service_logs.every((s) => s.product_usage.length === 0)).toBe(true);
    expect(result.final.service_logs.map((s) => s.revenue)).toEqual([5000, 2000]);
    expect(result.final.preserved).toEqual(preservedBefore);

    const zero: OperationalResetWipeCounts = {
      sales_edit_log: 0,
      inventory_movements: 0,
      stock_movements: 0,
      inventory_correction_log: 0,
      sales: 0,
      purchase_lines: 0,
      purchase_items: 0,
      purchases: 0,
      weekly_product_sales: 0,
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
    // No partial wipe — snapshot restored
    expect(result.rolledBack.wipe.sales_edit_log).toEqual([1, 2]);
    expect(result.rolledBack.wipe.sales).toEqual([10, 11, 12]);
    expect(result.rolledBack.wipe.stock_movements).toEqual([1, 2]);
    expect(result.rolledBack.wipe.purchase_items).toEqual([1, 2, 3]);
    expect(result.rolledBack.wipe.inventory_items).toEqual([1, 2, 3]);
    expect(result.rolledBack.service_logs[0]?.product_usage).toHaveLength(1);
    expect(result.rolledBack.preserved).toEqual(initial.preserved);
  });

  it("forced failure after purchase_items still restores stock_movements and purchase_items", () => {
    const initial = sampleDataset();
    const result = simulateOperationalReset(initial, { failAfterStep: "purchase_items" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rolledBack.wipe.purchase_items).toEqual([1, 2, 3]);
    expect(result.rolledBack.wipe.stock_movements).toEqual([1, 2]);
    expect(result.rolledBack.wipe.inventory_items.length).toBe(3);
  });

  it("forced failure after deeper step still restores full snapshot", () => {
    const initial = sampleDataset();
    const result = simulateOperationalReset(initial, { failAfterStep: "purchases" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rolledBack.wipe.purchases).toEqual([1]);
    expect(result.rolledBack.wipe.purchase_items).toEqual([1, 2, 3]);
    expect(result.rolledBack.wipe.stock_movements).toEqual([1, 2]);
    expect(result.rolledBack.wipe.inventory_items.length).toBe(3);
  });
});
