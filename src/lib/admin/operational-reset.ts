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
] as const;

/**
 * Production rejects unrestricted DELETE (sqlstate 21000).
 * Required-table deletes must use these exact WHERE true forms (no TRUNCATE).
 */
export const OPERATIONAL_RESET_REQUIRED_DELETE_SQL = [
  "delete from public.sales_edit_log where true",
  "delete from public.inventory_movements where true",
  "delete from public.inventory_correction_log where true",
  "delete from public.sales where true",
  "delete from public.purchase_lines where true",
  "delete from public.purchases where true",
  "delete from public.weekly_product_sales where true",
  "delete from public.weekly_service_sales where true",
  "delete from public.weekly_stylist_space_payments where true",
  "delete from public.weekly_sales_reports where true",
  "delete from public.inventory_import_batches where true",
  "delete from public.inventory_items where true",
  "delete from public.daily_cash_reconciliations where true",
  "delete from public.service_logs where true",
  "delete from public.space_lease_payments where true",
] as const;

/** Dynamic optional delete template used by safe_delete_table_if_exists. */
export const OPERATIONAL_RESET_OPTIONAL_DELETE_SQL_TEMPLATE =
  "delete from %s where true" as const;

export function assertDeleteUsesWhereTrue(sql: string): boolean {
  const normalized = sql.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized.startsWith("delete from ")) return false;
  if (normalized.includes("truncate")) return false;
  return normalized.endsWith(" where true") || normalized.includes(" where true;");
}

/**
 * Optional legacy tables: counted/deleted only via dynamic SQL after to_regclass.
 * Missing tables must not break preview counts or reset (count as 0 / skip delete).
 */
export const OPERATIONAL_RESET_OPTIONAL_LEGACY_TABLES = [
  "stock_movements",
  "sale_items",
  "purchase_items",
  "purchase_invoices",
  "weekly_log_product_lines",
  "weekly_log_service_lines",
  "weekly_logs",
] as const;

export type OperationalResetOptionalLegacyTable =
  (typeof OPERATIONAL_RESET_OPTIONAL_LEGACY_TABLES)[number];

/**
 * Mirrors SQL public.safe_table_count: absent optional relations count as 0.
 * `presentTables` is the set of tables that exist in the target database.
 */
export function safeOptionalTableCount(
  presentTables: ReadonlySet<string>,
  table: OperationalResetOptionalLegacyTable,
  rawCount: number,
): number {
  if (!presentTables.has(table)) return 0;
  return rawCount;
}

/**
 * Build wipe counts when some optional legacy tables are missing from the DB.
 * Required tables keep their raw counts; optional missing tables become 0.
 */
export function wipeCountsWithOptionalTablesAbsent(
  raw: OperationalResetWipeCounts,
  presentOptionalTables: ReadonlySet<string>,
): OperationalResetWipeCounts {
  const next = { ...raw };
  for (const table of OPERATIONAL_RESET_OPTIONAL_LEGACY_TABLES) {
    next[table] = safeOptionalTableCount(presentOptionalTables, table, raw[table]);
  }
  return next;
}

/**
 * Legacy weekly retail product lines live in `weekly_product_sales`.
 * Service/rental worksheet lines and report headers are also wiped for clean restart.
 */
export const LEGACY_PRODUCT_SALE_TABLE_MAPPING = {
  requirementLabel: "weekly/legacy product-sale rows",
  actualTable: "weekly_product_sales",
  wipedSiblingTables: [
    "weekly_service_sales",
    "weekly_stylist_space_payments",
    "weekly_sales_reports",
  ] as const,
} as const;

/** Live Sales Log analytics source tables (must be empty after reset). */
export const SALES_LOG_REVENUE_SOURCE_TABLES = [
  "sales",
  "service_logs",
  "space_lease_payments",
  "weekly_product_sales",
  "weekly_service_sales",
  "weekly_stylist_space_payments",
  "weekly_sales_reports",
] as const;

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
  weekly_sales_reports: [
    "weekly_product_sales",
    "weekly_service_sales",
    "weekly_stylist_space_payments",
  ],
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
  weekly_service_sales: number;
  weekly_stylist_space_payments: number;
  weekly_sales_reports: number;
  weekly_log_product_lines: number;
  weekly_log_service_lines: number;
  weekly_logs: number;
  inventory_import_batches: number;
  inventory_items: number;
  daily_cash_reconciliations: number;
  service_logs: number;
  space_lease_payments: number;
  service_logs_with_product_usage: number;
};

export type OperationalResetPreservedCounts = {
  /** auth.users — authentication identities */
  auth_users: number;
  /** Canonical portal role assignment (owner/manager/staff) */
  user_profiles: number;
  /** Legacy 1:1 auth mirror with role_id */
  users: number;
  /** Application role catalog (slug definitions) */
  roles: number;
  suppliers: number;
  operational_settings: number;
  services: number;
  stylists: number;
  stylist_services: number;
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
    counts.weekly_service_sales === 0 &&
    counts.weekly_stylist_space_payments === 0 &&
    counts.weekly_sales_reports === 0 &&
    counts.weekly_log_product_lines === 0 &&
    counts.weekly_log_service_lines === 0 &&
    counts.weekly_logs === 0 &&
    counts.inventory_import_batches === 0 &&
    counts.inventory_items === 0 &&
    counts.daily_cash_reconciliations === 0 &&
    counts.service_logs === 0 &&
    counts.space_lease_payments === 0 &&
    counts.service_logs_with_product_usage === 0
  );
}

/** Empty currency bag used by Sales Log analytics. */
export type SaleLogCurrencyTotals = { USD: number; LRD: number };

export type SaleLogRevenueTotals = {
  weekRetailUsdCents: number;
  weekServiceUsdCents: number;
  monthRetailUsdCents: number;
  monthServiceUsdCents: number;
  ytdRetailUsdCents: number;
  ytdServiceUsdCents: number;
  weekRentalUsdCents: number;
  monthRentalUsdCents: number;
  weekNative: { retail: SaleLogCurrencyTotals; service: SaleLogCurrencyTotals; rental: SaleLogCurrencyTotals };
  monthNative: { retail: SaleLogCurrencyTotals; service: SaleLogCurrencyTotals; rental: SaleLogCurrencyTotals };
  ytdNative: { retail: SaleLogCurrencyTotals; service: SaleLogCurrencyTotals; rental: SaleLogCurrencyTotals };
};

function emptyNativeBag(): SaleLogCurrencyTotals {
  return { USD: 0, LRD: 0 };
}

/** Analytics shape when all Sales Log source tables are empty (post-reset). */
export function emptySaleLogRevenueTotals(): SaleLogRevenueTotals {
  const emptyGroup = {
    retail: emptyNativeBag(),
    service: emptyNativeBag(),
    rental: emptyNativeBag(),
  };
  return {
    weekRetailUsdCents: 0,
    weekServiceUsdCents: 0,
    monthRetailUsdCents: 0,
    monthServiceUsdCents: 0,
    ytdRetailUsdCents: 0,
    ytdServiceUsdCents: 0,
    weekRentalUsdCents: 0,
    monthRentalUsdCents: 0,
    weekNative: structuredClone(emptyGroup),
    monthNative: structuredClone(emptyGroup),
    ytdNative: structuredClone(emptyGroup),
  };
}

export function assertSaleLogRevenueTotalsAreZero(totals: SaleLogRevenueTotals): boolean {
  const bags = [
    totals.weekNative.retail,
    totals.weekNative.service,
    totals.weekNative.rental,
    totals.monthNative.retail,
    totals.monthNative.service,
    totals.monthNative.rental,
    totals.ytdNative.retail,
    totals.ytdNative.service,
    totals.ytdNative.rental,
  ];
  return (
    totals.weekRetailUsdCents === 0 &&
    totals.weekServiceUsdCents === 0 &&
    totals.monthRetailUsdCents === 0 &&
    totals.monthServiceUsdCents === 0 &&
    totals.ytdRetailUsdCents === 0 &&
    totals.ytdServiceUsdCents === 0 &&
    totals.weekRentalUsdCents === 0 &&
    totals.monthRentalUsdCents === 0 &&
    bags.every((b) => b.USD === 0 && b.LRD === 0)
  );
}

/**
 * Derive Sales Log totals from wipe counts — all revenue sources empty ⇒ all totals zero.
 * Used by unit tests to prove post-reset Sales Log math without hitting the DB.
 */
export function saleLogTotalsFromWipeCounts(counts: OperationalResetWipeCounts): SaleLogRevenueTotals {
  if (
    counts.sales !== 0 ||
    counts.service_logs !== 0 ||
    counts.space_lease_payments !== 0 ||
    counts.weekly_product_sales !== 0 ||
    counts.weekly_service_sales !== 0 ||
    counts.weekly_stylist_space_payments !== 0 ||
    counts.weekly_sales_reports !== 0
  ) {
    // Non-zero sources: tests should not treat this as a clean Sales Log.
    return {
      ...emptySaleLogRevenueTotals(),
      weekRetailUsdCents: counts.sales,
      weekServiceUsdCents: counts.service_logs,
      weekRentalUsdCents: counts.space_lease_payments,
      monthRetailUsdCents: counts.sales,
      monthServiceUsdCents: counts.service_logs,
      monthRentalUsdCents: counts.space_lease_payments,
      ytdRetailUsdCents: counts.sales,
      ytdServiceUsdCents: counts.service_logs,
    };
  }
  return emptySaleLogRevenueTotals();
}

export type SimulatedResetDataset = {
  wipe: Record<(typeof OPERATIONAL_RESET_DELETE_ORDER)[number], number[]>;
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
      working.wipe[step] = [];
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
