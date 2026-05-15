"use client";

import { createRetailSalesBatchAction, type RetailSaleLineInput } from "@/app/actions/admin-salon";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";
import { currencyShortLabel, normalizeCurrency, type SalonCurrency } from "@/lib/admin/salon-format";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

type Row = RetailSaleLineInput & { key: string };

function newRow(): Row {
  return {
    key: crypto.randomUUID(),
    inventoryItemId: "",
    qty: "1",
    unitPrice: "",
    currency: "USD",
    customerName: "",
    notes: "",
  };
}

export function SalonRetailSaleBatchForm({ items }: { items: InventoryItemRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, newRow));

  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  return (
    <form
      className="admin-card space-y-5 p-5 pb-28 sm:p-6 sm:pb-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const lines: RetailSaleLineInput[] = rows
            .filter((r) => r.inventoryItemId && r.qty && r.unitPrice)
            .map((r) => ({
              inventoryItemId: r.inventoryItemId,
              qty: r.qty,
              unitPrice: r.unitPrice,
              currency: normalizeCurrency(r.currency),
              customerName: r.customerName || null,
              notes: r.notes || null,
            }));
          const r = await createRetailSalesBatchAction({ saleDate, lines });
          if (!r.ok) {
            setErr(r.error.replace(/_/g, " "));
            return;
          }
          setRows(Array.from({ length: 5 }, newRow));
          router.refresh();
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Sale date
          <input type="date" className={field} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
        </label>
        <p className="self-end text-xs text-white/40">
          Uses Monrovia calendar day. Stock and reporting update immediately after save.
        </p>
      </div>

      <div className="space-y-3">
        <div className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40 sm:grid sm:grid-cols-[1.4fr_0.55fr_0.85fr_0.65fr_0.85fr_0.6fr] sm:gap-2">
          <span>Product</span>
          <span>Qty</span>
          <span>Sell price</span>
          <span>CCY</span>
          <span>Customer</span>
          <span>Notes</span>
        </div>
        {rows.map((row, idx) => {
          const sel = itemById[row.inventoryItemId];
          return (
            <div
              key={row.key}
              className="grid gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:grid-cols-[1.4fr_0.55fr_0.85fr_0.65fr_0.85fr_0.6fr] sm:items-end sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0"
            >
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 sm:hidden">Product</label>
              <select
                className={field}
                value={row.inventoryItemId}
                onChange={(e) => {
                  const v = e.target.value;
                  const it = itemById[v];
                  setRows((rs) => {
                    const next = [...rs];
                    next[idx] = {
                      ...next[idx],
                      inventoryItemId: v,
                      currency:
                        it?.sell_price_lrd_cents != null && it.sell_price_lrd_cents > 0
                          ? "LRD"
                          : it?.sell_price_usd_cents != null && it.sell_price_usd_cents > 0
                            ? "USD"
                            : next[idx].currency,
                      unitPrice:
                        it?.sell_price_usd_cents != null && it.sell_price_usd_cents > 0
                          ? String(it.sell_price_usd_cents / 100)
                          : it?.sell_price_lrd_cents != null && it.sell_price_lrd_cents > 0
                            ? String(it.sell_price_lrd_cents / 100)
                            : next[idx].unitPrice,
                    };
                    return next;
                  });
                }}
              >
                <option value="">—</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.product_name} ({i.quantity_on_hand} {i.unit})
                  </option>
                ))}
              </select>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 sm:hidden">Qty</label>
              <input
                className={field}
                inputMode="decimal"
                value={row.qty}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((rs) => {
                    const next = [...rs];
                    next[idx] = { ...next[idx], qty: v };
                    return next;
                  });
                }}
              />
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 sm:hidden">Sell price</label>
              <input
                className={field}
                inputMode="decimal"
                placeholder="0.00"
                value={row.unitPrice}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((rs) => {
                    const next = [...rs];
                    next[idx] = { ...next[idx], unitPrice: v };
                    return next;
                  });
                }}
              />
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 sm:hidden">Currency</label>
              <select
                className={field}
                value={row.currency}
                onChange={(e) => {
                  const v = normalizeCurrency(e.target.value) as SalonCurrency;
                  setRows((rs) => {
                    const next = [...rs];
                    next[idx] = { ...next[idx], currency: v };
                    return next;
                  });
                }}
              >
                <option value="USD">USD</option>
                <option value="LRD">{currencyShortLabel("LRD")}</option>
              </select>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 sm:hidden">Customer</label>
              <input
                className={field}
                placeholder="Optional"
                value={row.customerName ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((rs) => {
                    const next = [...rs];
                    next[idx] = { ...next[idx], customerName: v };
                    return next;
                  });
                }}
              />
              <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 sm:hidden">Notes</label>
              <input
                className={field}
                placeholder="Optional"
                value={row.notes ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((rs) => {
                    const next = [...rs];
                    next[idx] = { ...next[idx], notes: v };
                    return next;
                  });
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="admin-form-sticky flex flex-col gap-3 sm:static sm:mt-0 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="button"
          className="min-h-[2.75rem] rounded-full border border-white/15 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70"
          onClick={() => setRows((r) => [...r, newRow()])}
        >
          Add another line
        </button>
        <button
          type="submit"
          disabled={pending || !items.length}
          className="min-h-[2.75rem] rounded-full bg-[var(--admin-accent)] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save sales"}
        </button>
      </div>
    </form>
  );
}
