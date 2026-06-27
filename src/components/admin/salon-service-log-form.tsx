"use client";

import { createServiceLogAction, type ProductUsageLine } from "@/app/actions/admin-salon";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";
import { normalizeCurrency } from "@/lib/admin/salon-format";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InventoryProductTypeaheadSelect } from "@/components/admin/inventory-product-typeahead";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

export function SalonServiceLogForm({ items }: { items: InventoryItemRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [usageRows, setUsageRows] = useState<{ id: string; qty: string }[]>([]);

  return (
    <form
      className="admin-card max-w-lg space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        const usage: ProductUsageLine[] = [];
        for (const row of usageRows) {
          if (!row.id) continue;
          const q = Number(row.qty);
          if (!Number.isFinite(q) || q <= 0) continue;
          usage.push({ inventory_item_id: row.id, qty: q });
        }
        start(async () => {
          const r = await createServiceLogAction({
            serviceName: String(fd.get("service_name") ?? ""),
            revenue: String(fd.get("revenue") ?? ""),
            currency: normalizeCurrency(String(fd.get("currency") ?? "NGN")),
            staffName: String(fd.get("staff") ?? "") || null,
            clientNote: String(fd.get("note") ?? "") || null,
            customerName: String(fd.get("customer_name") ?? "") || null,
            customerPhone: String(fd.get("customer_phone") ?? "") || null,
            customerFacebook: String(fd.get("customer_facebook") ?? "") || null,
            productUsage: usage,
          });
          if (!r.ok) {
            setErr(r.error.replace(/_/g, " "));
            return;
          }
          e.currentTarget.reset();
          setUsageRows([]);
          router.refresh();
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <label className="block text-xs text-white/55">
        Service name
        <input name="service_name" required className={field} placeholder="e.g. Knotless braids" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Revenue (total for service)
          <input name="revenue" type="number" step="0.01" min="0" required className={field} />
        </label>
        <label className="block text-xs text-white/55">
          Currency
          <select name="currency" className={field} defaultValue="NGN">
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
            <option value="LRD">LRD</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-white/55">
        Staff (optional)
        <input name="staff" className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Client name
          <input name="customer_name" className={field} placeholder="Optional" autoComplete="name" />
        </label>
        <label className="block text-xs text-white/55">
          Phone
          <input name="customer_phone" className={field} placeholder="Optional" inputMode="tel" autoComplete="tel" />
        </label>
        <label className="block text-xs text-white/55">
          Facebook
          <input name="customer_facebook" className={field} placeholder="Optional" />
        </label>
      </div>
      <label className="block text-xs text-white/55">
        Note (optional)
        <input name="note" className={field} />
      </label>

      <div className="border-t border-white/10 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Products used (optional)</p>
        <p className="mt-1 text-xs text-white/35">Deducts stock when you save.</p>
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
              className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60"
              onClick={() => setUsageRows((r) => r.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]"
          onClick={() => setUsageRows((r) => [...r, { id: "", qty: "1" }])}
        >
          + Add product line
        </button>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="admin-btn-primary w-full rounded-full px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Saving…" : "Log service"}
      </button>
    </form>
  );
}
