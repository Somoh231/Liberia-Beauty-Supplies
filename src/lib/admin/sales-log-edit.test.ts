import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SALES_LOG_AUTHORITATIVE_TABLES,
  SALES_LOG_NON_EDITABLE_SUMMARY_TABLES,
  canEditSalesLogSource,
  isEditableSalesLogSource,
  isValidCalendarDateYmd,
  mapServiceEditError,
  resolveServiceSoldAtOnEdit,
  saleLogCombinedTotalUsd,
  saleLogRentalTotalUsd,
  saleLogRetailTotalUsd,
  saleLogServiceTotalUsd,
  salesLogRecordKindLabel,
  simulateRetailSaleEdit,
  simulateServiceLogEdit,
  simulateSpaceLeaseEdit,
  type SimulatedSalesLogStore,
} from "@/lib/admin/sales-log-edit";
import { DEFAULT_ADMIN_RETURN_TO, sanitizeAdminReturnTo } from "@/lib/admin/safe-admin-return-to";

const SERVICE_EDIT_MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20260606120000_service_log_edit.sql",
);

function sampleStore(): SimulatedSalesLogStore {
  return {
    sales: [
      {
        id: "sale-1",
        inventory_item_id: "inv-1",
        qty: 2,
        unit_price_cents: 1000,
        currency: "USD",
        sold_at: "2026-07-01T12:00:00.000Z",
        customer_name: "A",
        notes: null,
        revenue_usd_equiv_cents: 2000,
      },
    ],
    service_logs: [
      {
        id: "svc-1",
        service_name: "Braids",
        service_category: "Braids and waving",
        revenue_cents: 5000,
        currency: "USD",
        sold_at: "2026-07-02T12:00:00.000Z",
        staff_name: "Sam",
        client_note: null,
        customer_name: "B",
        product_usage: [{ inventory_item_id: "inv-2", qty: 1 }],
        revenue_usd_equiv_cents: 5000,
        created_at: "2026-07-02T10:00:00.000Z",
        created_by: "user-1",
      },
    ],
    space_lease_payments: [
      {
        id: "lease-1",
        stylist_name: "Taylor",
        week_start_date: "2026-07-06",
        week_end_date: "2026-07-12",
        amount_cents: 10000,
        currency: "USD",
        notes: null,
        created_at: "2026-07-06T09:00:00.000Z",
        updated_at: "2026-07-06T09:00:00.000Z",
      },
    ],
  };
}

describe("Sales Log editable source contracts", () => {
  it("identifies authoritative tables vs non-editable weekly summaries", () => {
    expect([...SALES_LOG_AUTHORITATIVE_TABLES]).toEqual([
      "sales",
      "service_logs",
      "space_lease_payments",
    ]);
    expect([...SALES_LOG_NON_EDITABLE_SUMMARY_TABLES]).toEqual([
      "weekly_sales_reports",
      "weekly_product_sales",
      "weekly_service_sales",
      "weekly_stylist_space_payments",
    ]);
    expect(isEditableSalesLogSource("sales")).toBe(true);
    expect(isEditableSalesLogSource("service_logs")).toBe(true);
    expect(isEditableSalesLogSource("space_lease_payments")).toBe(true);
    expect(isEditableSalesLogSource("weekly_service_sales")).toBe(false);
    expect(isEditableSalesLogSource("weekly_sales_reports")).toBe(false);
    expect(salesLogRecordKindLabel("retail_sale")).toBe("Retail sale");
    expect(salesLogRecordKindLabel("service_transaction")).toBe("Service transaction");
    expect(salesLogRecordKindLabel("stylist_fee_rental")).toBe("Stylist fee / rental payment");
  });

  it("retail edit updates the existing record without creating a duplicate", () => {
    const initial = sampleStore();
    const beforeCount = initial.sales.length;
    const result = simulateRetailSaleEdit(initial, {
      saleId: "sale-1",
      inventoryItemId: "inv-1",
      qty: 3,
      unitPriceCents: 1500,
      currency: "USD",
      saleDate: "2026-07-03",
      customerName: "A2",
      notes: "fixed qty",
      editReason: "Wrong qty",
      role: "manager",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe("sale-1");
    expect(result.store.sales).toHaveLength(beforeCount);
    expect(result.store.sales[0]?.id).toBe("sale-1");
    expect(result.store.sales[0]?.qty).toBe(3);
    expect(result.store.sales[0]?.unit_price_cents).toBe(1500);
    expect(result.store.sales[0]?.revenue_usd_equiv_cents).toBe(4500);
    expect(saleLogRetailTotalUsd(result.store)).toBe(4500);
  });

  it("service edit updates the existing service_logs row and preserves id/created_*", () => {
    const initial = sampleStore();
    const beforeCount = initial.service_logs.length;
    const result = simulateServiceLogEdit(initial, {
      serviceLogId: "svc-1",
      serviceName: "Knotless braids",
      serviceCategory: "Braids and waving",
      revenueCents: 7500,
      currency: "USD",
      serviceDate: "2026-07-04",
      staffName: "Sam",
      editReason: "Price correction",
      role: "owner",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe("svc-1");
    expect(result.store.service_logs).toHaveLength(beforeCount);
    expect(result.store.service_logs[0]?.id).toBe("svc-1");
    expect(result.store.service_logs[0]?.created_at).toBe("2026-07-02T10:00:00.000Z");
    expect(result.store.service_logs[0]?.created_by).toBe("user-1");
    expect(result.store.service_logs[0]?.revenue_cents).toBe(7500);
    expect(saleLogServiceTotalUsd(result.store)).toBe(7500);
  });

  it("stylist-fee edit updates the existing space_lease_payments row", () => {
    const initial = sampleStore();
    const beforeCount = initial.space_lease_payments.length;
    const result = simulateSpaceLeaseEdit(initial, {
      id: "lease-1",
      stylistName: "Taylor Updated",
      weekStartDate: "2026-07-06",
      weekEndDate: "2026-07-12",
      amountCents: 12000,
      currency: "USD",
      notes: "adjusted",
      role: "manager",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.id).toBe("lease-1");
    expect(result.store.space_lease_payments).toHaveLength(beforeCount);
    expect(result.store.space_lease_payments[0]?.id).toBe("lease-1");
    expect(result.store.space_lease_payments[0]?.created_at).toBe("2026-07-06T09:00:00.000Z");
    expect(result.store.space_lease_payments[0]?.amount_cents).toBe(12000);
    expect(result.store.space_lease_payments[0]?.stylist_name).toBe("Taylor Updated");
    expect(saleLogRentalTotalUsd(result.store)).toBe(12000);
  });

  it("unauthorized edits fail for staff", () => {
    const store = sampleStore();
    expect(
      simulateRetailSaleEdit(store, {
        saleId: "sale-1",
        inventoryItemId: "inv-1",
        qty: 1,
        unitPriceCents: 1000,
        currency: "USD",
        saleDate: "2026-07-01",
        editReason: "fix",
        role: "staff",
      }).ok,
    ).toBe(false);
    expect(
      simulateServiceLogEdit(store, {
        serviceLogId: "svc-1",
        serviceName: "X",
        revenueCents: 1,
        currency: "USD",
        serviceDate: "2026-07-02",
        editReason: "fix",
        role: "staff",
      }),
    ).toMatchObject({ ok: false, error: "unauthorized" });
    expect(
      simulateSpaceLeaseEdit(store, {
        id: "lease-1",
        stylistName: "T",
        weekStartDate: "2026-07-06",
        weekEndDate: "2026-07-12",
        amountCents: 1,
        currency: "USD",
        role: "staff",
      }),
    ).toMatchObject({ ok: false, error: "unauthorized" });
    expect(canEditSalesLogSource("staff")).toBe(false);
    expect(canEditSalesLogSource("manager")).toBe(true);
    expect(canEditSalesLogSource("owner")).toBe(true);
  });

  it("Sales Log totals reflect edited values across retail/service/rental", () => {
    let store = sampleStore();
    expect(saleLogCombinedTotalUsd(store)).toBe(2000 + 5000 + 10000);

    const retail = simulateRetailSaleEdit(store, {
      saleId: "sale-1",
      inventoryItemId: "inv-1",
      qty: 1,
      unitPriceCents: 1000,
      currency: "USD",
      saleDate: "2026-07-01",
      editReason: "qty down",
      role: "manager",
    });
    expect(retail.ok).toBe(true);
    if (!retail.ok) return;
    store = retail.store;

    const service = simulateServiceLogEdit(store, {
      serviceLogId: "svc-1",
      serviceName: "Braids",
      revenueCents: 4000,
      currency: "USD",
      serviceDate: "2026-07-02",
      editReason: "amount down",
      role: "manager",
    });
    expect(service.ok).toBe(true);
    if (!service.ok) return;
    store = service.store;

    const lease = simulateSpaceLeaseEdit(store, {
      id: "lease-1",
      stylistName: "Taylor",
      weekStartDate: "2026-07-06",
      weekEndDate: "2026-07-12",
      amountCents: 8000,
      currency: "USD",
      role: "owner",
    });
    expect(lease.ok).toBe(true);
    if (!lease.ok) return;
    store = lease.store;

    expect(saleLogRetailTotalUsd(store)).toBe(1000);
    expect(saleLogServiceTotalUsd(store)).toBe(4000);
    expect(saleLogRentalTotalUsd(store)).toBe(8000);
    expect(saleLogCombinedTotalUsd(store)).toBe(13000);
  });

  it("service edit migration defines in-place RPC and audit without wipe deletes", () => {
    const sql = readFileSync(SERVICE_EDIT_MIGRATION, "utf8");
    const executable = sql
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");

    expect(executable).toMatch(/create or replace function public\.admin_edit_service_log/i);
    expect(executable).toMatch(/create table if not exists public\.service_logs_edit_log/i);
    expect(executable).toMatch(/update public\.service_logs/i);
    expect(executable).toMatch(/service_edit_restore/);
    expect(executable).toMatch(/service_edit_deduct/);
    expect(executable).toMatch(/is_salon_portal_admin\(\)/);
    expect(executable).toMatch(/invalid_service_date/);
    expect(executable).toMatch(/p_payload \? 'service_date'/);
    expect(executable).toMatch(/to_char\(v_day::date, 'YYYY-MM-DD'\)/);
    expect(executable).not.toMatch(/delete from public\.service_logs where true/i);
    // Audit inserts into service_logs_edit_log are expected; never re-insert the source row.
    expect(executable).not.toMatch(/insert into public\.service_logs\s*\(/i);
  });

  it("maps service edit error codes", () => {
    expect(mapServiceEditError("unauthorized")).toBe("unauthorized");
    expect(mapServiceEditError("forbidden")).toBe("unauthorized");
    expect(mapServiceEditError("service_log_not_found")).toBe("service_log_not_found");
    expect(mapServiceEditError("edit_reason_required")).toBe("edit_reason_required");
    expect(mapServiceEditError("insufficient_stock")).toBe("insufficient_stock");
    expect(mapServiceEditError("invalid_service_date")).toBe("invalid_service_date");
    expect(mapServiceEditError("missing", "PGRST202")).toBe("migration_required");
  });

  it("absent service_date preserves existing sold_at; valid date updates; bad dates fail", () => {
    const old = "2026-07-02T12:00:00.000Z";
    expect(resolveServiceSoldAtOnEdit(false, undefined, old)).toEqual({ ok: true, soldAt: old });
    expect(resolveServiceSoldAtOnEdit(true, "2026-07-15", old)).toEqual({
      ok: true,
      soldAt: "2026-07-15T12:00:00.000Z",
    });
    expect(resolveServiceSoldAtOnEdit(true, "", old)).toEqual({ ok: false, error: "invalid_service_date" });
    expect(resolveServiceSoldAtOnEdit(true, "not-a-date", old)).toEqual({
      ok: false,
      error: "invalid_service_date",
    });
    expect(resolveServiceSoldAtOnEdit(true, "2026-02-30", old)).toEqual({
      ok: false,
      error: "invalid_service_date",
    });
    expect(resolveServiceSoldAtOnEdit(true, "2026-13-01", old)).toEqual({
      ok: false,
      error: "invalid_service_date",
    });
    expect(isValidCalendarDateYmd("2026-07-15")).toBe(true);
    expect(isValidCalendarDateYmd("2026-02-30")).toBe(false);

    const store = sampleStore();
    const preserved = simulateServiceLogEdit(store, {
      serviceLogId: "svc-1",
      serviceName: "Braids",
      revenueCents: 5000,
      currency: "USD",
      serviceDateKey: "absent",
      editReason: "no date change",
      role: "manager",
    });
    expect(preserved.ok).toBe(true);
    if (!preserved.ok) return;
    expect(preserved.id).toBe("svc-1");
    expect(preserved.store.service_logs[0]?.sold_at).toBe(old);
    expect(preserved.store.service_logs).toHaveLength(1);

    const updated = simulateServiceLogEdit(store, {
      serviceLogId: "svc-1",
      serviceName: "Braids",
      revenueCents: 5000,
      currency: "USD",
      serviceDate: "2026-07-15",
      editReason: "date correction",
      role: "manager",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.id).toBe("svc-1");
    expect(updated.store.service_logs[0]?.sold_at).toBe("2026-07-15T12:00:00.000Z");

    const bad = simulateServiceLogEdit(store, {
      serviceLogId: "svc-1",
      serviceName: "Braids",
      revenueCents: 5000,
      currency: "USD",
      serviceDate: "2026-02-30",
      editReason: "bad date",
      role: "manager",
    });
    expect(bad).toMatchObject({ ok: false, error: "invalid_service_date" });
    expect(store.service_logs[0]?.id).toBe("svc-1");
  });

  it("sanitizeAdminReturnTo accepts only safe /admin/ paths", () => {
    expect(sanitizeAdminReturnTo("/admin/sales-log")).toBe("/admin/sales-log");
    expect(sanitizeAdminReturnTo("/admin/services/new")).toBe("/admin/services/new");
    expect(sanitizeAdminReturnTo("/admin/sales-log?tab=retail")).toBe("/admin/sales-log?tab=retail");

    expect(sanitizeAdminReturnTo("https://evil.example/admin/sales-log")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("//evil.example/admin")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("javascript:alert(1)")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("data:text/html,hi")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("   ")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("/login")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("/admin")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo("/admin/../etc/passwd")).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo(null)).toBe(DEFAULT_ADMIN_RETURN_TO);
    expect(sanitizeAdminReturnTo(undefined)).toBe(DEFAULT_ADMIN_RETURN_TO);

    expect(isEditableSalesLogSource("weekly_product_sales")).toBe(false);
    expect(isEditableSalesLogSource("weekly_stylist_space_payments")).toBe(false);
  });
});
