"use client";

import { createProductSaleAction } from "@/app/actions/admin-salon";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";
import { normalizeCurrency } from "@/lib/admin/salon-format";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { InventoryProductTypeaheadSelect } from "@/components/admin/inventory-product-typeahead";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

export function SalonProductSaleForm({ items }: { items: InventoryItemRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");

  const selected = useMemo(() => items.find((i) => i.id === itemId) ?? null, [items, itemId]);

  return (
    <form
      className="admin-card max-w-lg space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createProductSaleAction({
            inventoryItemId: String(fd.get("inventory_item_id") ?? ""),
            qty: String(fd.get("qty") ?? ""),
            unitPrice: String(fd.get("unit_price") ?? ""),
            currency: normalizeCurrency(String(fd.get("currency") ?? "NGN")),
            paymentMethod: String(fd.get("payment") ?? "") || null,
            notes: String(fd.get("notes") ?? "") || null,
          });
          if (!r.ok) {
            setErr(r.error.replace(/_/g, " "));
            return;
          }
          e.currentTarget.reset();
          router.refresh();
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <input type="hidden" name="inventory_item_id" value={itemId} />
      <label className="block text-xs text-white/55">
        Product
        <InventoryProductTypeaheadSelect
          items={items}
          value={itemId}
          placeholder={items.length === 0 ? "No products yet" : "—"}
          inputClassName={field}
          onValueChange={(v) => setItemId(v)}
        />
      </label>
      {selected ? (
        <p className="text-xs text-white/45">
          Sale currency must match cost currency ({selected.cost_currency}) for accurate profit.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Quantity sold
          <input name="qty" type="number" step="0.01" min="0.01" required className={field} defaultValue="1" />
        </label>
        <label className="block text-xs text-white/55">
          Unit price
          <input name="unit_price" type="number" step="0.01" min="0" required className={field} />
        </label>
      </div>
      <label className="block text-xs text-white/55">
        Currency
        <select name="currency" className={field} defaultValue={selected?.cost_currency ?? "NGN"}>
          <option value="NGN">NGN</option>
          <option value="USD">USD</option>
          <option value="LRD">LRD</option>
        </select>
      </label>
      <label className="block text-xs text-white/55">
        Payment (optional)
        <input name="payment" className={field} placeholder="Cash, Orange, etc." />
      </label>
      <label className="block text-xs text-white/55">
        Notes
        <input name="notes" className={field} />
      </label>
      <button
        type="submit"
        disabled={pending || !itemId}
        className="admin-btn-primary w-full rounded-full px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Recording…" : "Record sale"}
      </button>
    </form>
  );
}
