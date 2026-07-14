/** Shared contracts for owner operational hard-reset (app + tests). */

export const OPERATIONAL_RESET_CONFIRM_PHRASE = "RESET SALES AND INVENTORY" as const;

/** FK-safe wipe order used by admin_reset_sales_and_inventory. */
export const OPERATIONAL_RESET_DELETE_ORDER = [
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

/** Parent tables that must be wiped only after their child operational tables. */
export const OPERATIONAL_RESET_PARENT_AFTER_CHILDREN = {
  inventory_items: [
    "inventory_movements",
    "stock_movements",
    "inventory_correction_log",
    "sales",
    "purchase_lines",
    "purchase_items",
    "weekly_product_sales",
    "weekly_log_product_lines",
    "sale_items",
  ],
  sales: ["sales_edit_log", "sale_items"],
  purchases: ["purchase_lines", "purchase_items", "purchase_invoices"],
} as const;

export type OperationalResetWipeCounts = {
  sales_edit_log: number;
  inventory_movements: number;
  stock_movements: number;
  inventory_correction_log: number;
  sale_items: number;
  sales: number;
  purchase_lines: number;
  purchase_items: number;
  purchase_invoices: number;
  purchases: number;
  weekly_product_sales: number;
  weekly_log_product_lines: number;
  weekly_log_service_lines: number;
  weekly_logs: number;
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
    counts.stock_movements === 0 &&
    counts.inventory_correction_log === 0 &&
    counts.sale_items === 0 &&
    counts.sales === 0 &&
    counts.purchase_lines === 0 &&
    counts.purchase_items === 0 &&
    counts.purchase_invoices === 0 &&
    counts.purchases === 0 &&
    counts.weekly_product_sales === 0 &&
    counts.weekly_log_product_lines === 0 &&
    counts.weekly_log_service_lines === 0 &&
    counts.weekly_logs === 0 &&
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

/** Admin-safe FK detail: foreign_key_violation:table_name:constraint_name */
export function formatForeignKeyViolationError(message: string): string | null {
  const raw = message ?? "";
  if (!/foreign key|23503|violates foreign key/i.test(raw) && !/constraint .*fkey/i.test(raw)) {
    return null;
  }
  const constraint =
    raw.match(/foreign key constraint ["']?([a-zA-Z0-9_]+)["']?/i)?.[1] ??
    raw.match(/constraint ["']?([a-zA-Z0-9_]+)["']?/i)?.[1];
  // Postgres: update or delete on table "parent" violates ... on table "child"
  // Prefer the referencing (child) table — last "on table" occurrence.
  const onTables = [...raw.matchAll(/\bon table ["']?([a-zA-Z0-9_]+)["']?/gi)].map((m) => m[1]);
  const table = onTables.length > 1 ? onTables[onTables.length - 1] : onTables[0];
  if (!constraint && !table) return null;
  const parts = ["foreign_key_violation"];
  if (table) parts.push(table);
  if (constraint) parts.push(constraint);
  return parts.join(":");
}

/**
 * Map RPC / PostgREST errors to specific, owner-visible codes.
 * Prefer exact exception names over a generic reset_failed.
 */
export function mapOperationalResetError(message: string, code?: string): string {
  const msg = (message ?? "").trim();
  const lower = msg.toLowerCase();

  if (code === "PGRST202" || lower.includes("could not find the function") || lower.includes("schema cache")) {
    return "migration_required";
  }
  if (lower.includes("unauthorized") || code === "42501" || lower.includes("forbidden")) {
    return "forbidden_owner_required";
  }
  if (lower.includes("confirmation_mismatch")) return "confirmation_mismatch";
  if (lower.includes("backup_confirmation_required")) return "backup_confirmation_required";
  if (lower.includes("reauth_required")) return "reauth_required";
  if (lower.includes("reauth_expired") || lower.includes("reauth_failed")) return "reauth_expired";

  if (lower.includes("preserved_data_changed")) {
    const detail = msg.replace(/^.*preserved_data_changed:?\s*/i, "").trim();
    return detail ? `preserved_data_changed: ${detail}` : "preserved_data_changed";
  }
  if (lower.includes("reset_incomplete")) {
    const detail = msg.replace(/^.*reset_incomplete:?\s*/i, "").trim();
    return detail ? `reset_incomplete: ${detail}` : "reset_incomplete";
  }

  const fk = formatForeignKeyViolationError(msg);
  if (fk || code === "23503") return fk ?? "foreign_key_violation";

  if (lower.includes("forced_test_failure")) return "reset_failed: forced_test_failure";

  // Prefer carrying a trimmed server message over a blind generic string.
  if (lower.startsWith("reset_failed:")) {
    return msg.length > 280 ? `${msg.slice(0, 277)}...` : msg;
  }
  if (msg && !lower.includes("json") && msg.length < 280) {
    return `reset_failed: ${msg}`;
  }
  return "reset_failed";
}
