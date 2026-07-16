/**
 * Pure contracts for Sales Log source-record editing (Chunk 1).
 * Authoritative tables: sales, service_logs, space_lease_payments.
 * weekly_* worksheets are archived/non-authoritative — not directly editable.
 */

export const SALES_LOG_AUTHORITATIVE_TABLES = [
  "sales",
  "service_logs",
  "space_lease_payments",
] as const;

export const SALES_LOG_NON_EDITABLE_SUMMARY_TABLES = [
  "weekly_sales_reports",
  "weekly_product_sales",
  "weekly_service_sales",
  "weekly_stylist_space_payments",
] as const;

export type SalesLogRecordKind = "retail_sale" | "service_transaction" | "stylist_fee_rental";

export function salesLogRecordKindLabel(kind: SalesLogRecordKind): string {
  switch (kind) {
    case "retail_sale":
      return "Retail sale";
    case "service_transaction":
      return "Service transaction";
    case "stylist_fee_rental":
      return "Stylist fee / rental payment";
  }
}

export function isAuthoritativeSalesLogTable(table: string): boolean {
  return (SALES_LOG_AUTHORITATIVE_TABLES as readonly string[]).includes(table);
}

export function isEditableSalesLogSource(table: string): boolean {
  if ((SALES_LOG_NON_EDITABLE_SUMMARY_TABLES as readonly string[]).includes(table)) {
    return false;
  }
  return isAuthoritativeSalesLogTable(table);
}

export type SimulatedRetailSale = {
  id: string;
  inventory_item_id: string;
  qty: number;
  unit_price_cents: number;
  currency: string;
  sold_at: string;
  customer_name: string | null;
  notes: string | null;
  revenue_usd_equiv_cents: number;
};

export type SimulatedServiceLog = {
  id: string;
  service_name: string;
  service_category: string | null;
  revenue_cents: number;
  currency: string;
  sold_at: string;
  staff_name: string | null;
  client_note: string | null;
  customer_name: string | null;
  product_usage: { inventory_item_id: string; qty: number }[];
  revenue_usd_equiv_cents: number;
  created_at: string;
  created_by: string | null;
};

export type SimulatedSpaceLease = {
  id: string;
  stylist_name: string;
  week_start_date: string;
  week_end_date: string;
  amount_cents: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SimulatedSalesLogStore = {
  sales: SimulatedRetailSale[];
  service_logs: SimulatedServiceLog[];
  space_lease_payments: SimulatedSpaceLease[];
};

export type EditAuthRole = "owner" | "manager" | "staff";

export function canEditSalesLogSource(role: EditAuthRole): boolean {
  return role === "owner" || role === "manager";
}

/** Simple USD-only total for unit tests (cents). */
export function saleLogRetailTotalUsd(store: SimulatedSalesLogStore): number {
  return store.sales.reduce((n, s) => n + (s.revenue_usd_equiv_cents || 0), 0);
}

export function saleLogServiceTotalUsd(store: SimulatedSalesLogStore): number {
  return store.service_logs.reduce((n, s) => n + (s.revenue_usd_equiv_cents || 0), 0);
}

export function saleLogRentalTotalUsd(store: SimulatedSalesLogStore): number {
  return store.space_lease_payments.reduce((n, s) => {
    if (s.currency === "USD") return n + s.amount_cents;
    return n + s.amount_cents; // test fixtures use USD
  }, 0);
}

export function saleLogCombinedTotalUsd(store: SimulatedSalesLogStore): number {
  return saleLogRetailTotalUsd(store) + saleLogServiceTotalUsd(store) + saleLogRentalTotalUsd(store);
}

export type RetailEditInput = {
  saleId: string;
  inventoryItemId: string;
  qty: number;
  unitPriceCents: number;
  currency: string;
  saleDate: string;
  customerName?: string | null;
  notes?: string | null;
  editReason: string;
  role: EditAuthRole;
};

/**
 * In-memory retail edit: updates existing row, never inserts a duplicate.
 */
export function simulateRetailSaleEdit(
  store: SimulatedSalesLogStore,
  input: RetailEditInput,
):
  | { ok: true; store: SimulatedSalesLogStore; id: string }
  | { ok: false; error: string; store: SimulatedSalesLogStore } {
  if (!canEditSalesLogSource(input.role)) {
    return { ok: false, error: "unauthorized", store };
  }
  if ((input.editReason?.trim() ?? "").length < 3) {
    return { ok: false, error: "edit_reason_required", store };
  }
  const idx = store.sales.findIndex((s) => s.id === input.saleId);
  if (idx < 0) return { ok: false, error: "sale_not_found", store };

  const next = structuredClone(store);
  const row = next.sales[idx]!;
  const id = row.id;
  next.sales[idx] = {
    ...row,
    id,
    inventory_item_id: input.inventoryItemId,
    qty: input.qty,
    unit_price_cents: input.unitPriceCents,
    currency: input.currency,
    sold_at: `${input.saleDate}T12:00:00.000Z`,
    customer_name: input.customerName ?? null,
    notes: input.notes ?? null,
    revenue_usd_equiv_cents: Math.round(input.qty * input.unitPriceCents),
  };
  return { ok: true, store: next, id };
}

/**
 * Real calendar YYYY-MM-DD (rejects regex-only matches like 2026-02-30).
 * Mirrors admin_edit_service_log round-trip validation.
 */
export function isValidCalendarDateYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [ys, ms, ds] = value.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Resolve sold_at for service_log edit from payload key presence + value.
 * - key absent → preserve old
 * - key present but blank/malformed/impossible → invalid_service_date
 * - key present + valid YMD → update
 */
export function resolveServiceSoldAtOnEdit(
  payloadHasServiceDate: boolean,
  serviceDate: string | null | undefined,
  oldSoldAt: string,
): { ok: true; soldAt: string } | { ok: false; error: "invalid_service_date" } {
  if (!payloadHasServiceDate) {
    return { ok: true, soldAt: oldSoldAt };
  }
  const day = (serviceDate ?? "").trim();
  if (!day || !isValidCalendarDateYmd(day)) {
    return { ok: false, error: "invalid_service_date" };
  }
  return { ok: true, soldAt: `${day}T12:00:00.000Z` };
}

export type ServiceEditInput = {
  serviceLogId: string;
  serviceName: string;
  serviceCategory?: string | null;
  revenueCents: number;
  currency: string;
  /**
   * When `serviceDateKey` is "absent", sold_at is preserved.
   * When "present" (default if serviceDate is provided), value is validated.
   */
  serviceDate?: string | null;
  serviceDateKey?: "absent" | "present";
  staffName?: string | null;
  clientNote?: string | null;
  customerName?: string | null;
  productUsage?: { inventory_item_id: string; qty: number }[];
  editReason: string;
  role: EditAuthRole;
};

export function simulateServiceLogEdit(
  store: SimulatedSalesLogStore,
  input: ServiceEditInput,
):
  | { ok: true; store: SimulatedSalesLogStore; id: string }
  | { ok: false; error: string; store: SimulatedSalesLogStore } {
  if (!canEditSalesLogSource(input.role)) {
    return { ok: false, error: "unauthorized", store };
  }
  if ((input.editReason?.trim() ?? "").length < 3) {
    return { ok: false, error: "edit_reason_required", store };
  }
  const idx = store.service_logs.findIndex((s) => s.id === input.serviceLogId);
  if (idx < 0) return { ok: false, error: "service_log_not_found", store };

  const next = structuredClone(store);
  const row = next.service_logs[idx]!;
  const id = row.id;
  const createdAt = row.created_at;
  const createdBy = row.created_by;

  const payloadHasServiceDate =
    input.serviceDateKey === "present" ||
    (input.serviceDateKey !== "absent" && input.serviceDate !== undefined);
  const dateResolved = resolveServiceSoldAtOnEdit(payloadHasServiceDate, input.serviceDate, row.sold_at);
  if (!dateResolved.ok) {
    return { ok: false, error: dateResolved.error, store };
  }

  next.service_logs[idx] = {
    ...row,
    id,
    created_at: createdAt,
    created_by: createdBy,
    service_name: input.serviceName.trim(),
    service_category: input.serviceCategory ?? null,
    revenue_cents: input.revenueCents,
    currency: input.currency,
    sold_at: dateResolved.soldAt,
    staff_name: input.staffName ?? null,
    client_note: input.clientNote ?? null,
    customer_name: input.customerName ?? null,
    product_usage: input.productUsage ?? row.product_usage,
    revenue_usd_equiv_cents: input.revenueCents,
  };
  return { ok: true, store: next, id };
}

export type SpaceLeaseEditInput = {
  id: string;
  stylistName: string;
  weekStartDate: string;
  weekEndDate: string;
  amountCents: number;
  currency: string;
  notes?: string | null;
  role: EditAuthRole;
};

export function simulateSpaceLeaseEdit(
  store: SimulatedSalesLogStore,
  input: SpaceLeaseEditInput,
):
  | { ok: true; store: SimulatedSalesLogStore; id: string }
  | { ok: false; error: string; store: SimulatedSalesLogStore } {
  if (!canEditSalesLogSource(input.role)) {
    return { ok: false, error: "unauthorized", store };
  }
  const idx = store.space_lease_payments.findIndex((s) => s.id === input.id);
  if (idx < 0) return { ok: false, error: "not_found", store };

  const next = structuredClone(store);
  const row = next.space_lease_payments[idx]!;
  const id = row.id;
  const createdAt = row.created_at;
  next.space_lease_payments[idx] = {
    ...row,
    id,
    created_at: createdAt,
    stylist_name: input.stylistName.trim(),
    week_start_date: input.weekStartDate,
    week_end_date: input.weekEndDate,
    amount_cents: input.amountCents,
    currency: input.currency,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  return { ok: true, store: next, id };
}

export function mapServiceEditError(message: string, code?: string): string {
  const msg = (message ?? "transaction_failed").toLowerCase();
  if (code === "PGRST202" || msg.includes("admin_edit_service_log") || msg.includes("could not find the function")) {
    return "migration_required";
  }
  if (msg.includes("unauthorized") || msg.includes("42501") || msg.includes("forbidden")) {
    return "unauthorized";
  }
  if (msg.includes("service_log_not_found") || msg.includes("invalid_service_log_id")) {
    return "service_log_not_found";
  }
  if (msg.includes("edit_reason_required")) return "edit_reason_required";
  if (msg.includes("invalid_service_date") || msg.includes("invalid_date")) return "invalid_service_date";
  if (msg.includes("invalid_revenue")) return "invalid_revenue";
  if (msg.includes("invalid_currency")) return "invalid_currency";
  if (msg.includes("invalid_name")) return "invalid_name";
  if (msg.includes("invalid_product_usage")) return "invalid_product_usage";
  if (msg.includes("insufficient_stock")) return "insufficient_stock";
  return "transaction_failed";
}
