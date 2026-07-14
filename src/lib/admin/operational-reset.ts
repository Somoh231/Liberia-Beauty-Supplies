/** Shared contracts for owner operational hard-reset (app + tests). */

export const OPERATIONAL_RESET_CONFIRM_PHRASE = "RESET SALES AND INVENTORY" as const;

/** FK-safe wipe order used by admin_reset_sales_and_inventory. */
export const OPERATIONAL_RESET_DELETE_ORDER = [
  "sales_edit_log",
  "inventory_movements",
  "inventory_correction_log",
  "sales",
  "purchase_lines",
  "purchases",
  "weekly_product_sales",
  "inventory_import_batches",
  "inventory_items",
  "daily_cash_reconciliations",
  "service_logs.product_usage_clear",
] as const;

/**
 * Legacy weekly retail product lines live in `weekly_product_sales`.
 * Preserved (not wiped): weekly_sales_reports, weekly_service_sales.
 */
export const LEGACY_PRODUCT_SALE_TABLE_MAPPING = {
  requirementLabel: "weekly/legacy product-sale rows",
  actualTable: "weekly_product_sales",
  preservedSiblingTables: ["weekly_sales_reports", "weekly_service_sales"] as const,
} as const;

export type OperationalResetWipeCounts = {
  sales_edit_log: number;
  inventory_movements: number;
  inventory_correction_log: number;
  sales: number;
  purchase_lines: number;
  purchases: number;
  weekly_product_sales: number;
  inventory_import_batches: number;
  inventory_items: number;
  daily_cash_reconciliations: number;
  service_logs_with_product_usage: number;
};

export type OperationalResetPreservedCounts = {
  user_profiles: number;
  suppliers: number;
  service_logs: number;
  space_lease_payments: number;
  operational_settings: number;
  weekly_sales_reports: number;
  weekly_service_sales: number;
};

export type OperationalResetPreview = {
  wipe: OperationalResetWipeCounts;
  preserved: OperationalResetPreservedCounts;
  preserved_tables: string[];
  fx: { ngn_per_usd: number; lrd_per_usd: number };
  delete_order: string[];
};

export type OperationalResetResult = {
  reset_id: string;
  pre: OperationalResetWipeCounts;
  post: OperationalResetWipeCounts;
  preserved: OperationalResetPreservedCounts;
};

export function isExactResetConfirmation(value: string): boolean {
  return value.trim() === OPERATIONAL_RESET_CONFIRM_PHRASE;
}

export function canEnableOperationalReset(input: {
  hasPreview: boolean;
  backupConfirmed: boolean;
  confirmation: string;
  reauthChallengeId: string | null;
  pending: boolean;
}): boolean {
  return (
    input.hasPreview &&
    input.backupConfirmed &&
    isExactResetConfirmation(input.confirmation) &&
    !!input.reauthChallengeId &&
    !input.pending
  );
}

export function assertWipeCountsAreZero(counts: OperationalResetWipeCounts): boolean {
  return (
    counts.sales_edit_log === 0 &&
    counts.inventory_movements === 0 &&
    counts.inventory_correction_log === 0 &&
    counts.sales === 0 &&
    counts.purchase_lines === 0 &&
    counts.purchases === 0 &&
    counts.weekly_product_sales === 0 &&
    counts.inventory_import_batches === 0 &&
    counts.inventory_items === 0 &&
    counts.daily_cash_reconciliations === 0 &&
    counts.service_logs_with_product_usage === 0
  );
}

export type SimulatedResetDataset = {
  wipe: Record<(typeof OPERATIONAL_RESET_DELETE_ORDER)[number], number[]>;
  service_logs: { id: string; product_usage: unknown[]; revenue: number }[];
  preserved: OperationalResetPreservedCounts;
};

/**
 * In-memory model of the reset transaction for unit tests.
 * `failAfterStep` rolls back to the snapshot if a step fails.
 */
export function simulateOperationalReset(
  initial: SimulatedResetDataset,
  opts?: { failAfterStep?: (typeof OPERATIONAL_RESET_DELETE_ORDER)[number] },
): { ok: true; final: SimulatedResetDataset } | { ok: false; rolledBack: SimulatedResetDataset; error: string } {
  const snapshot: SimulatedResetDataset = structuredClone(initial);
  const working: SimulatedResetDataset = structuredClone(initial);

  try {
    for (const step of OPERATIONAL_RESET_DELETE_ORDER) {
      if (step === "service_logs.product_usage_clear") {
        working.service_logs = working.service_logs.map((row) => ({
          ...row,
          product_usage: [],
        }));
      } else {
        working.wipe[step] = [];
      }
      if (opts?.failAfterStep && opts.failAfterStep === step) {
        throw new Error("forced_test_failure");
      }
    }
    return { ok: true, final: working };
  } catch (e) {
    return {
      ok: false,
      rolledBack: snapshot,
      error: e instanceof Error ? e.message : "transaction_failed",
    };
  }
}

export function mapOperationalResetError(message: string, code?: string): string {
  const msg = (message ?? "").toLowerCase();
  if (code === "PGRST202" || msg.includes("admin_reset_sales_and_inventory") || msg.includes("could not find the function")) {
    return "migration_required";
  }
  if (msg.includes("unauthorized") || msg.includes("42501") || msg.includes("forbidden")) {
    return "forbidden_owner_required";
  }
  if (msg.includes("confirmation_mismatch")) return "confirmation_mismatch";
  if (msg.includes("backup_confirmation_required")) return "backup_confirmation_required";
  if (msg.includes("reauth_required")) return "reauth_required";
  if (msg.includes("reauth_expired") || msg.includes("reauth_failed")) return "reauth_expired";
  if (msg.includes("reset_incomplete") || msg.includes("preserved_data_changed")) return "reset_failed";
  if (msg.includes("forced_test_failure")) return "reset_failed";
  return "reset_failed";
}
