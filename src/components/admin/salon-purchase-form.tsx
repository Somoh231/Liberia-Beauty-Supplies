"use client";

import { createPurchaseAction, type PurchaseLineInput } from "@/app/actions/admin-salon";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";
import { normalizeCurrency } from "@/lib/admin/salon-format";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

export function SalonPurchaseForm({
  suppliers,
  items,
}: {
  suppliers: { id: string; name: string }[];
  items: InventoryItemRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<PurchaseLineInput[]>([{ inventoryItemId: "", qty: "1", unitCost: "" }]);
  const [dateKey, setDateKey] = useState("");

  useEffect(() => {
    setDateKey(new Date().toISOString().slice(0, 10));
  }, []);

  return (
    <form
      className="admin-card max-w-2xl space-y-5 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        const cleanLines = lines.filter((l) => l.inventoryItemId && l.qty && l.unitCost);
        if (!cleanLines.length) {
          setErr("Add at least one line with product, quantity, and unit cost.");
          return;
        }
        start(async () => {
          const r = await createPurchaseAction({
            supplierId: String(fd.get("supplier_id") ?? ""),
            purchaseDate: String(fd.get("purchase_date") ?? ""),
            currency: normalizeCurrency(String(fd.get("currency") ?? "NGN")),
            notes: String(fd.get("notes") ?? "") || null,
            shippingReference: String(fd.get("ship_ref") ?? "") || null,
            fxNgnPerUsd: String(fd.get("fx_ngn_usd") ?? "") || null,
            shippingLandedUsd: String(fd.get("shipping_usd") ?? "") || null,
            lines: cleanLines,
            markReceived: fd.get("mark_received") === "on",
          });
          if (!r.ok) {
            setErr(r.error);
            return;
          }
          router.push("/admin/purchases");
          router.refresh();
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Supplier
          <select name="supplier_id" required className={field} defaultValue={suppliers[0]?.id}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-white/55">
          Purchase date
          <input name="purchase_date" type="date" required className={field} defaultValue={dateKey} key={dateKey} />
        </label>
      </div>
      <label className="block text-xs text-white/55">
        Currency (shipment)
        <select name="currency" className={field} defaultValue="NGN">
          <option value="NGN">NGN</option>
          <option value="USD">USD</option>
          <option value="LRD">LRD</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          FX (NGN per 1 USD)
          <input name="fx_ngn_usd" type="number" step="0.01" min="0" className={field} placeholder="e.g. 1385" />
        </label>
        <label className="block text-xs text-white/55">
          Landed / shipping (USD total)
          <input name="shipping_usd" type="number" step="0.01" min="0" className={field} placeholder="0.00" />
        </label>
      </div>
      <label className="block text-xs text-white/55">
        Shipping reference
        <input name="ship_ref" className={field} placeholder="Container / AWB" />
      </label>
      <label className="block text-xs text-white/55">
        Notes
        <textarea name="notes" rows={2} className={field} />
      </label>

      <div className="border-t border-white/10 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Line items</p>
        {lines.map((line, idx) => (
          <div key={idx} className="mt-3 grid gap-3 rounded-xl border border-white/8 bg-black/20 p-3 sm:grid-cols-[1fr_100px_120px_auto] sm:items-end">
            <label className="block text-xs text-white/55">
              Product
              <select
                className={field}
                value={line.inventoryItemId}
                onChange={(e) => {
                  const n = [...lines];
                  n[idx] = { ...n[idx], inventoryItemId: e.target.value };
                  setLines(n);
                }}
              >
                <option value="">Select…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/55">
              Qty
              <input
                className={field}
                value={line.qty}
                onChange={(e) => {
                  const n = [...lines];
                  n[idx] = { ...n[idx], qty: e.target.value };
                  setLines(n);
                }}
              />
            </label>
            <label className="block text-xs text-white/55">
              Unit cost
              <input
                className={field}
                value={line.unitCost}
                placeholder="0.00"
                onChange={(e) => {
                  const n = [...lines];
                  n[idx] = { ...n[idx], unitCost: e.target.value };
                  setLines(n);
                }}
              />
            </label>
            <button
              type="button"
              className="rounded-full border border-white/15 px-3 py-2 text-[10px] font-semibold uppercase text-white/55"
              onClick={() => setLines((r) => r.filter((_, i) => i !== idx))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]"
          onClick={() => setLines((r) => [...r, { inventoryItemId: "", qty: "1", unitCost: "" }])}
        >
          + Add line
        </button>
      </div>

      <label className="flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" name="mark_received" className="h-4 w-4 rounded border-white/20" defaultChecked />
        Mark as received (adds to stock now)
      </label>

      <button
        type="submit"
        disabled={pending}
        className="admin-btn-primary rounded-full px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save purchase"}
      </button>
    </form>
  );
}
