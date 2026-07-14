import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LEGACY_PRODUCT_SALE_TABLE_MAPPING,
  OPERATIONAL_RESET_CONFIRM_PHRASE,
  OPERATIONAL_RESET_DELETE_ORDER,
  OPERATIONAL_RESET_OPTIONAL_DELETE_SQL_TEMPLATE,
  OPERATIONAL_RESET_OPTIONAL_LEGACY_TABLES,
  OPERATIONAL_RESET_PARENT_AFTER_CHILDREN,
  OPERATIONAL_RESET_REQUIRED_DELETE_SQL,
  SALES_LOG_REVENUE_SOURCE_TABLES,
  assertDeleteUsesWhereTrue,
  assertSaleLogRevenueTotalsAreZero,
  assertWipeCountsAreZero,
  canEnableOperationalReset,
  emptySaleLogRevenueTotals,
  formatForeignKeyViolationError,
  isExactResetConfirmation,
  mapOperationalResetError,
  saleLogTotalsFromWipeCounts,
  simulateOperationalReset,
  wipeCountsWithOptionalTablesAbsent,
  type OperationalResetWipeCounts,
  type SimulatedResetDataset,
} from "@/lib/admin/operational-reset";

const WIPE_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260603120000_operational_hard_reset_clear_sales_log_revenue.sql",
);

const PRESERVED_FIX_MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260604120000_operational_reset_remove_nonexistent_preserved_tables.sql",
);

function emptyWipe(): OperationalResetWipeCounts {
  return {
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
    weekly_service_sales: 0,
    weekly_stylist_space_payments: 0,
    weekly_sales_reports: 0,
    weekly_log_product_lines: 0,
    weekly_log_service_lines: 0,
    weekly_logs: 0,
    inventory_import_batches: 0,
    inventory_items: 0,
    daily_cash_reconciliations: 0,
    service_logs: 0,
    space_lease_payments: 0,
    service_logs_with_product_usage: 0,
  };
}

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
      weekly_service_sales: [1, 2, 3],
      weekly_stylist_space_payments: [1],
      weekly_sales_reports: [1, 2],
      weekly_log_product_lines: [1],
      weekly_log_service_lines: [1],
      weekly_logs: [1],
      inventory_import_batches: [1],
      inventory_items: [1, 2, 3],
      daily_cash_reconciliations: [1],
      service_logs: [1, 2],
      space_lease_payments: [1, 2, 3],
    },
    preserved: {
      auth_users: 3,
      user_profiles: 3,
      users: 3,
      roles: 5,
      operational_settings: 1,
      suppliers: 4,
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

  it("maps legacy product-sale rows and wipes worksheet siblings", () => {
    expect(LEGACY_PRODUCT_SALE_TABLE_MAPPING.actualTable).toBe("weekly_product_sales");
    expect(LEGACY_PRODUCT_SALE_TABLE_MAPPING.wipedSiblingTables).toContain("weekly_service_sales");
    expect(LEGACY_PRODUCT_SALE_TABLE_MAPPING.wipedSiblingTables).toContain("weekly_sales_reports");
    expect(LEGACY_PRODUCT_SALE_TABLE_MAPPING.wipedSiblingTables).toContain("weekly_stylist_space_payments");
  });

  it("documents FK-safe delete order including Sales Log revenue sources", () => {
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
      "weekly_service_sales",
      "weekly_stylist_space_payments",
      "weekly_sales_reports",
      "weekly_log_product_lines",
      "weekly_log_service_lines",
      "weekly_logs",
      "inventory_import_batches",
      "inventory_items",
      "daily_cash_reconciliations",
      "service_logs",
      "space_lease_payments",
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
    for (const child of OPERATIONAL_RESET_PARENT_AFTER_CHILDREN.weekly_sales_reports) {
      expect(idx(child)).toBeLessThan(idx("weekly_sales_reports"));
    }
  });

  it("identifies Sales Log revenue source tables", () => {
    expect([...SALES_LOG_REVENUE_SOURCE_TABLES]).toEqual([
      "sales",
      "service_logs",
      "space_lease_payments",
      "weekly_product_sales",
      "weekly_service_sales",
      "weekly_stylist_space_payments",
      "weekly_sales_reports",
    ]);
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

  it("empties wipe-scope tables including Sales Log service and rental history", () => {
    const initial = sampleDataset();
    const preservedBefore = { ...initial.preserved };
    const result = simulateOperationalReset(initial);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const step of OPERATIONAL_RESET_DELETE_ORDER) {
      expect(result.final.wipe[step]).toEqual([]);
    }

    expect(result.final.wipe.service_logs).toEqual([]);
    expect(result.final.wipe.space_lease_payments).toEqual([]);
    expect(result.final.wipe.weekly_service_sales).toEqual([]);
    expect(result.final.wipe.weekly_sales_reports).toEqual([]);
    expect(result.final.preserved).toEqual(preservedBefore);
    expect(result.final.preserved.auth_users).toBe(3);
    expect(result.final.preserved.users).toBe(3);
    expect(result.final.preserved.roles).toBe(5);
    expect(result.final.preserved.user_profiles).toBe(3);
    expect(result.final.preserved.suppliers).toBe(4);
    expect(result.final.preserved.operational_settings).toBe(1);
    expect(result.final.preserved).not.toHaveProperty("services");
    expect(result.final.preserved).not.toHaveProperty("stylists");
    expect(result.final.preserved).not.toHaveProperty("stylist_services");

    const zero = emptyWipe();
    expect(assertWipeCountsAreZero(zero)).toBe(true);

    const salesLogTotals = saleLogTotalsFromWipeCounts(zero);
    expect(assertSaleLogRevenueTotalsAreZero(salesLogTotals)).toBe(true);
    expect(salesLogTotals).toEqual(emptySaleLogRevenueTotals());
    expect(salesLogTotals.weekRetailUsdCents).toBe(0);
    expect(salesLogTotals.weekServiceUsdCents).toBe(0);
    expect(salesLogTotals.weekRentalUsdCents).toBe(0);
    expect(salesLogTotals.monthRetailUsdCents).toBe(0);
    expect(salesLogTotals.monthServiceUsdCents).toBe(0);
    expect(salesLogTotals.monthRentalUsdCents).toBe(0);
    expect(salesLogTotals.ytdRetailUsdCents).toBe(0);
    expect(salesLogTotals.ytdServiceUsdCents).toBe(0);
  });

  it("rolls back fully when a mid-delete failure is forced (transactionality)", () => {
    const initial = sampleDataset();
    const result = simulateOperationalReset(initial, { failAfterStep: "sales_edit_log" });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toBe("forced_test_failure");
    expect(result.rolledBack.wipe.sales_edit_log).toEqual([1, 2]);
    expect(result.rolledBack.wipe.sales).toEqual([10, 11, 12]);
    expect(result.rolledBack.wipe.service_logs).toEqual([1, 2]);
    expect(result.rolledBack.wipe.space_lease_payments).toEqual([1, 2, 3]);
    expect(result.rolledBack.wipe.weekly_service_sales).toEqual([1, 2, 3]);
    expect(result.rolledBack.preserved).toEqual(initial.preserved);
    expect(result.rolledBack.preserved.auth_users).toBe(3);
    expect(result.rolledBack.preserved.suppliers).toBe(4);
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
    expect(result.rolledBack.wipe.service_logs.length).toBe(2);
  });

  it("treats missing optional legacy tables as zero counts (safe_table_count contract)", () => {
    const present = new Set<string>();
    const raw: OperationalResetWipeCounts = {
      ...emptyWipe(),
      stock_movements: 99,
      sale_items: 42,
      purchase_items: 7,
      purchase_invoices: 3,
      weekly_log_product_lines: 5,
      weekly_log_service_lines: 4,
      weekly_logs: 2,
    };
    const coerced = wipeCountsWithOptionalTablesAbsent(raw, present);
    expect(coerced.sale_items).toBe(0);
    expect(coerced.stock_movements).toBe(0);
    expect(coerced.purchase_items).toBe(0);
    expect(coerced.purchase_invoices).toBe(0);
    expect(coerced.weekly_logs).toBe(0);
    expect(assertWipeCountsAreZero(coerced)).toBe(true);

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

  it("requires DELETE ... WHERE true (not unrestricted DELETE or TRUNCATE)", () => {
    for (const sql of OPERATIONAL_RESET_REQUIRED_DELETE_SQL) {
      expect(assertDeleteUsesWhereTrue(sql)).toBe(true);
      expect(sql.toLowerCase()).toContain(" where true");
      expect(sql.toLowerCase()).not.toContain("truncate");
    }
    expect(OPERATIONAL_RESET_OPTIONAL_DELETE_SQL_TEMPLATE).toBe("delete from %s where true");
    expect(assertDeleteUsesWhereTrue(OPERATIONAL_RESET_OPTIONAL_DELETE_SQL_TEMPLATE)).toBe(true);
    expect(assertDeleteUsesWhereTrue("delete from public.sales")).toBe(false);
    expect(assertDeleteUsesWhereTrue("truncate public.sales")).toBe(false);
  });

  it("wipe migration deletes service/rental transaction history", () => {
    const sql = readFileSync(WIPE_MIGRATION_PATH, "utf8");
    const executable = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");

    expect(executable).toMatch(/delete from public\.service_logs where true/i);
    expect(executable).toMatch(/delete from public\.space_lease_payments where true/i);
    expect(executable).toMatch(/delete from public\.weekly_service_sales where true/i);
    expect(executable).toMatch(/delete from public\.weekly_stylist_space_payments where true/i);
    expect(executable).toMatch(/delete from public\.weekly_sales_reports where true/i);
    expect(executable).not.toMatch(/delete from public\.user_profiles where true/i);
    expect(executable).not.toMatch(/delete from public\.users where true/i);
    expect(executable).not.toMatch(/delete from public\.roles where true/i);
    expect(executable).not.toMatch(/delete from auth\.users where true/i);
    expect(executable).not.toMatch(/delete from public\.suppliers where true/i);
    expect(executable).not.toMatch(/delete from public\.operational_settings where true/i);
    expect(executable).not.toMatch(
      /update public\.service_logs\s+set product_usage/i,
    );

    expect(OPERATIONAL_RESET_DELETE_ORDER).toContain("service_logs");
    expect(OPERATIONAL_RESET_DELETE_ORDER).toContain("weekly_service_sales");
    expect(OPERATIONAL_RESET_DELETE_ORDER).toContain("weekly_stylist_space_payments");
    expect(OPERATIONAL_RESET_DELETE_ORDER).toContain("space_lease_payments");
    expect(OPERATIONAL_RESET_REQUIRED_DELETE_SQL).toContain("delete from public.service_logs where true");
    expect(OPERATIONAL_RESET_REQUIRED_DELETE_SQL).toContain(
      "delete from public.weekly_service_sales where true",
    );
    expect(OPERATIONAL_RESET_REQUIRED_DELETE_SQL).toContain(
      "delete from public.weekly_stylist_space_payments where true",
    );
    expect(OPERATIONAL_RESET_REQUIRED_DELETE_SQL).toContain(
      "delete from public.space_lease_payments where true",
    );
  });

  it("preserved-fix migration has no static refs to nonexistent service/stylist tables", () => {
    const sql = readFileSync(PRESERVED_FIX_MIGRATION_PATH, "utf8");
    const executable = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");

    expect(executable).not.toMatch(/public\.services/i);
    expect(executable).not.toMatch(/public\.stylists/i);
    expect(executable).not.toMatch(/public\.stylist_services/i);
    expect(executable).not.toMatch(/'services'/);
    expect(executable).not.toMatch(/'stylists'/);
    expect(executable).not.toMatch(/'stylist_services'/);

    expect(executable).toMatch(/'auth_users',\s*\(select count\(\*\)::int from auth\.users\)/);
    expect(executable).toMatch(/'user_profiles',\s*\(select count\(\*\)::int from public\.user_profiles\)/);
    expect(executable).toMatch(/'users',\s*\(select count\(\*\)::int from public\.users\)/);
    expect(executable).toMatch(/'roles',\s*\(select count\(\*\)::int from public\.roles\)/);
    expect(executable).toMatch(/'suppliers',\s*\(select count\(\*\)::int from public\.suppliers\)/);
    expect(executable).toMatch(
      /'operational_settings',\s*\(select count\(\*\)::int from public\.operational_settings\)/,
    );

    // Wipe targets remain listed in preview delete_order (not preserved)
    expect(executable).toMatch(/'service_logs'/);
    expect(executable).toMatch(/'weekly_service_sales'/);
    expect(executable).toMatch(/'weekly_stylist_space_payments'/);
    expect(executable).toMatch(/'space_lease_payments'/);
  });

  it("preserved report includes real auth/RBAC sources only (no invented catalog tables)", () => {
    const initial = sampleDataset();
    expect(Object.keys(initial.preserved).sort()).toEqual(
      [
        "auth_users",
        "operational_settings",
        "roles",
        "suppliers",
        "user_profiles",
        "users",
      ].sort(),
    );
    expect(initial.preserved.auth_users).toBe(initial.preserved.user_profiles);
    expect(initial.preserved.roles).toBeGreaterThan(0);

    const sql = readFileSync(PRESERVED_FIX_MIGRATION_PATH, "utf8");
    const preservedFnExecutable = sql
      .slice(
        sql.indexOf("create or replace function public.operational_reset_preserved_counts"),
        sql.indexOf("comment on function public.operational_reset_preserved_counts"),
      )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    expect(preservedFnExecutable).toContain("auth.users");
    expect(preservedFnExecutable).toContain("public.user_profiles");
    expect(preservedFnExecutable).toContain("public.users");
    expect(preservedFnExecutable).toContain("public.roles");
    expect(preservedFnExecutable).toContain("public.suppliers");
    expect(preservedFnExecutable).toContain("public.operational_settings");
    expect(preservedFnExecutable).not.toMatch(/public\.services/);
    expect(preservedFnExecutable).not.toMatch(/public\.stylists/);
    expect(preservedFnExecutable).not.toMatch(/public\.stylist_services/);
    expect(preservedFnExecutable).not.toMatch(/'RBAC'/);

    const previewExecutable = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    expect(previewExecutable).toMatch(/'auth\.users'/);
    expect(previewExecutable).toMatch(/'user_profiles'/);
    expect(previewExecutable).toMatch(/'users'/);
    expect(previewExecutable).toMatch(/'roles'/);
    expect(previewExecutable).toMatch(/'suppliers'/);
    expect(previewExecutable).toMatch(/'operational_settings'/);
    expect(previewExecutable).not.toMatch(/'services'/);
    expect(previewExecutable).not.toMatch(/'stylists'/);
    expect(previewExecutable).not.toMatch(/'stylist_services'/);
  });

  it("missing service configuration tables cannot break preserved assertion keys", () => {
    // Production: to_regclass('public.services') is null — preserved payload must omit those keys.
    const preserved = sampleDataset().preserved;
    for (const forbidden of ["services", "stylists", "stylist_services"] as const) {
      expect(Object.prototype.hasOwnProperty.call(preserved, forbidden)).toBe(false);
    }
    for (const required of [
      "auth_users",
      "user_profiles",
      "users",
      "roles",
      "suppliers",
      "operational_settings",
    ] as const) {
      expect(typeof preserved[required]).toBe("number");
    }
  });
});
