"use client";

import { editServiceLogAction, type ProductUsageLine } from "@/app/actions/admin-salon";
import type { InventoryItemRow, ServiceLogRow } from "@/lib/admin/salon-queries";
import { SERVICE_CATEGORY_OPTIONS } from "@/lib/admin/salon-finance";
import { normalizeCurrency } from "@/lib/admin/salon-format";
import { sanitizeAdminReturnTo } from "@/lib/admin/safe-admin-return-to";
import { InventoryProductTypeaheadSelect } from "@/components/admin/inventory-product-typeahead";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

function errMsg(code: string): string {
  const map: Record<string, string> = {
    edit_reason_required: "Edit reason is required (at least 3 characters).",
    insufficient_stock: "Not enough stock for updated product usage.",
    invalid_revenue: "Invalid revenue amount.",
    invalid_currency: "Invalid currency.",
    invalid_date: "Invalid service date.",
    invalid_service_date: "Invalid service date.",
    invalid_name: "Service name is required.",
    invalid_product_usage: "Product usage lines are invalid.",
    unauthorized: "Only managers and owners can edit service transactions.",
    forbidden_manager_required: "Only managers and owners can edit service transactions.",
    migration_required:
      "Service edit requires migration 20260606120000_service_log_edit.sql on Supabase.",
    service_log_not_found: "Service transaction not found.",
    transaction_failed: "Service edit failed and was rolled back. Try again or contact support.",
  };
  return map[code] ?? code.replace(/_/g, " ");
}

export function SalonServiceEditForm({
  log,
  items,
  returnTo = "/admin/sales-log",
}: {
  log: ServiceLogRow;
  items: InventoryItemRow[];
  returnTo?: string;
}) {
  const router = useRouter();
  const safeReturnTo = sanitizeAdminReturnTo(returnTo);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const initialCategory = log.service_category ?? "";
  const categoryInList = SERVICE_CATEGORY_OPTIONS.includes(initialCategory as (typeof SERVICE_CATEGORY_OPTIONS)[number]);

  const [serviceName, setServiceName] = useState(log.service_name);
  const [serviceCategory, setServiceCategory] = useState(
    categoryInList ? initialCategory : initialCategory ? "Others" : SERVICE_CATEGORY_OPTIONS[0] ?? "",
  );
  const [revenue, setRevenue] = useState((log.revenue_cents / 100).toFixed(2));
  const [currency, setCurrency] = useState(log.currency);
  const [serviceDate, setServiceDate] = useState(log.sold_at.slice(0, 10));
  const [staffName, setStaffName] = useState(log.staff_name ?? "");
  const [clientNote, setClientNote] = useState(log.client_note ?? "");
  const [customerName, setCustomerName] = useState(log.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(log.customer_phone ?? "");
  const [customerFacebook, setCustomerFacebook] = useState(log.customer_facebook ?? "");
  const [editReason, setEditReason] = useState("");
  const [usageRows, setUsageRows] = useState<{ id: string; qty: string }[]>(() =>
    (log.product_usage ?? []).map((u) => ({
      id: u.inventory_item_id,
      qty: String(u.qty),
    })),
  );

  const immutableHint = useMemo(
    () => `ID ${log.id.slice(0, 8)}… · created ${log.created_at ? new Date(log.created_at).toLocaleString() : "—"}`,
    [log.created_at, log.id],
  );

  return (
    <form
      className="admin-card space-y-5 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        setOkMsg(null);
        const usage: ProductUsageLine[] = [];
        for (const row of usageRows) {
          if (!row.id) continue;
          const q = Number(row.qty);
          if (!Number.isFinite(q) || q <= 0) continue;
          usage.push({ inventory_item_id: row.id, qty: q });
        }
        start(async () => {
          const name =
            serviceCategory === "Others" && clientNote.trim()
              ? serviceName.trim() || `Others — ${clientNote.trim()}`
              : serviceName.trim() || serviceCategory;
          const r = await editServiceLogAction({
            serviceLogId: log.id,
            serviceName: name,
            serviceCategory: serviceCategory || null,
            revenue,
            currency: normalizeCurrency(currency),
            serviceDate,
            staffName: staffName || null,
            clientNote: clientNote || null,
            customerName: customerName || null,
            customerPhone: customerPhone || null,
            customerFacebook: customerFacebook || null,
            productUsage: usage,
            editReason,
          });
          if (!r.ok) {
            setErr(errMsg(r.error));
            return;
          }
          setOkMsg("Service transaction updated.");
          router.push(safeReturnTo);
          router.refresh();
        });
      }}
    >
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        Editing a service transaction updates the existing Sales Log row (no duplicate). Product usage restores prior
        stock, then deducts the updated usage. Changes are audited.
      </div>
      <p className="text-xs text-white/40">{immutableHint}</p>

      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      {okMsg ? <p className="text-sm text-emerald-300">{okMsg}</p> : null}

      <label className="block text-xs text-white/55">
        Edit reason (required)
        <input
          className={field}
          value={editReason}
          onChange={(e) => setEditReason(e.target.value)}
          placeholder="e.g. Wrong amount entered"
          required
          minLength={3}
        />
      </label>

      <label className="block text-xs text-white/55">
        Transaction date
        <input type="date" className={field} value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required />
      </label>

      <label className="block text-xs text-white/55">
        Service category
        <select className={field} value={serviceCategory} onChange={(e) => setServiceCategory(e.target.value)}>
          {SERVICE_CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-white/55">
        Service name / description
        <input className={field} value={serviceName} onChange={(e) => setServiceName(e.target.value)} required />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Amount
          <input
            className={field}
            inputMode="decimal"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            required
          />
        </label>
        <label className="block text-xs text-white/55">
          Currency
          <select className={field} value={currency} onChange={(e) => setCurrency(normalizeCurrency(e.target.value))}>
            <option value="USD">USD</option>
            <option value="LRD">LRD</option>
            <option value="NGN">NGN</option>
          </select>
        </label>
      </div>

      <label className="block text-xs text-white/55">
        Stylist / staff
        <input className={field} value={staffName} onChange={(e) => setStaffName(e.target.value)} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Client name
          <input className={field} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </label>
        <label className="block text-xs text-white/55">
          Phone
          <input className={field} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </label>
        <label className="block text-xs text-white/55">
          Facebook
          <input className={field} value={customerFacebook} onChange={(e) => setCustomerFacebook(e.target.value)} />
        </label>
      </div>

      <label className="block text-xs text-white/55">
        Notes
        <input className={field} value={clientNote} onChange={(e) => setClientNote(e.target.value)} />
      </label>

      <div className="border-t border-white/10 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Products used</p>
        <p className="mt-1 text-xs text-white/35">Optional. Updating usage restores prior stock, then deducts new lines.</p>
        {usageRows.map((row, idx) => (
          <div key={idx} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block flex-1 text-xs text-white/55">
              Item
              <InventoryProductTypeaheadSelect
                items={items}
                value={row.id}
                placeholder="—"
                inputClassName={field}
                onValueChange={(v) => {
                  const next = [...usageRows];
                  next[idx] = { ...next[idx], id: v };
                  setUsageRows(next);
                }}
              />
            </label>
            <label className="block w-full text-xs text-white/55 sm:w-28">
              Qty
              <input
                className={field}
                value={row.qty}
                onChange={(e) => {
                  const next = [...usageRows];
                  next[idx] = { ...next[idx], qty: e.target.value };
                  setUsageRows(next);
                }}
              />
            </label>
            <button
              type="button"
              className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300/80"
              onClick={() => setUsageRows(usageRows.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
          onClick={() => setUsageRows([...usageRows, { id: "", qty: "1" }])}
        >
          + Add product usage
        </button>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="admin-btn-primary rounded-full px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          className="admin-btn-secondary rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
          onClick={() => router.push(safeReturnTo)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
