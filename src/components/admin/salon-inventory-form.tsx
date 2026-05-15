"use client";

import { createInventoryItemAction, updateInventoryItemAction } from "@/app/actions/admin-salon";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";
import { normalizeCurrency, type SalonCurrency } from "@/lib/admin/salon-format";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

function currencySelect(name: string, defaultValue: SalonCurrency) {
  return (
    <select name={name} className={field} defaultValue={defaultValue}>
      <option value="NGN">NGN</option>
      <option value="USD">USD</option>
      <option value="LRD">LRD</option>
    </select>
  );
}

export function SalonInventoryNewForm({ supplierOptions }: { supplierOptions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="admin-card max-w-2xl space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createInventoryItemAction({
            productName: String(fd.get("product_name") ?? ""),
            sku: String(fd.get("sku") ?? "") || null,
            unit: String(fd.get("unit") ?? "") || null,
            supplierId: String(fd.get("supplier_id") ?? "") || null,
            category: String(fd.get("category") ?? "") || null,
            notes: String(fd.get("notes") ?? "") || null,
            openingQty: String(fd.get("opening_qty") ?? "") || null,
            reorderLevel: String(fd.get("reorder_level") ?? "5"),
            lowStockThreshold: String(fd.get("low_stock_threshold") ?? "5"),
            avgUnitCost: String(fd.get("avg_cost") ?? "0"),
            costCurrency: normalizeCurrency(String(fd.get("cost_currency") ?? "NGN")),
            sellingPrice: String(fd.get("sell_price") ?? "") || null,
            sellingPriceCurrency: normalizeCurrency(String(fd.get("price_currency") ?? "NGN")),
            fxNgnPerUsd: String(fd.get("fx_ngn_usd") ?? "") || null,
            landedUsd: String(fd.get("landed_usd") ?? "") || null,
            storePriceUsd: String(fd.get("store_price_usd") ?? "") || null,
            sellPriceUsd: String(fd.get("sell_price_usd") ?? "") || null,
            sellPriceLd: String(fd.get("sell_price_ld") ?? "") || null,
          });
          if (!r.ok) {
            setErr(r.error.replace(/_/g, " "));
            return;
          }
          if (r.id) router.push(`/admin/inventory/${r.id}`);
          else router.push("/admin/inventory");
          router.refresh();
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <p className="text-xs text-white/45">
        Product code is assigned automatically (001, 002, …) and is never reused after delete.
      </p>
      <label className="block text-xs text-white/55">
        Product name
        <input name="product_name" required className={field} placeholder="e.g. Human Hair curly 16" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          SKU (optional)
          <input name="sku" className={field} />
        </label>
        <label className="block text-xs text-white/55">
          Unit
          <input name="unit" className={field} placeholder="each, pack" defaultValue="each" />
        </label>
      </div>
      <label className="block text-xs text-white/55">
        Category (optional)
        <input name="category" className={field} />
      </label>
      <label className="block text-xs text-white/55">
        Default supplier (optional)
        <select name="supplier_id" className={field}>
          <option value="">—</option>
          {supplierOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-white/55">
        Notes (optional)
        <textarea name="notes" rows={2} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Opening quantity
          <input name="opening_qty" type="number" step="0.01" min="0" defaultValue="0" className={field} />
        </label>
        <label className="block text-xs text-white/55">
          Reorder level
          <input name="reorder_level" type="number" step="0.01" min="0" defaultValue="5" className={field} required />
        </label>
        <label className="block text-xs text-white/55">
          Low stock threshold
          <input name="low_stock_threshold" type="number" step="0.01" min="0" defaultValue="5" className={field} required />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Unit cost (average)
          <input name="avg_cost" type="number" step="0.01" min="0" defaultValue="0" className={field} required />
        </label>
        <label className="block text-xs text-white/55">
          Cost currency
          {currencySelect("cost_currency", "NGN")}
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Selling price (optional)
          <input name="sell_price" type="number" step="0.01" min="0" className={field} />
        </label>
        <label className="block text-xs text-white/55">
          Price currency
          {currencySelect("price_currency", "NGN")}
        </label>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Nigeria → Liberia costing (optional)</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          FX (NGN per 1 USD)
          <input name="fx_ngn_usd" type="number" step="0.01" min="0" className={field} placeholder="e.g. 1550" />
        </label>
        <label className="block text-xs text-white/55">
          Landed cost (USD / unit)
          <input name="landed_usd" type="number" step="0.01" min="0" className={field} placeholder="0" />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Store price (USD)
          <input name="store_price_usd" type="number" step="0.01" min="0" className={field} />
        </label>
        <label className="block text-xs text-white/55">
          Sell price (USD)
          <input name="sell_price_usd" type="number" step="0.01" min="0" className={field} />
        </label>
        <label className="block text-xs text-white/55">
          Sell price (LD)
          <input name="sell_price_ld" type="number" step="0.01" min="0" className={field} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--admin-accent)] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Saving…" : "Save product"}
      </button>
    </form>
  );
}

export function SalonInventoryEditForm({ item, supplierOptions }: { item: InventoryItemRow; supplierOptions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="admin-card max-w-2xl space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await updateInventoryItemAction({
            id: item.id,
            productName: String(fd.get("product_name") ?? ""),
            sku: String(fd.get("sku") ?? "") || null,
            unit: String(fd.get("unit") ?? "") || null,
            supplierId: String(fd.get("supplier_id") ?? "") || null,
            category: String(fd.get("category") ?? "") || null,
            notes: String(fd.get("notes") ?? "") || null,
            reorderLevel: String(fd.get("reorder_level") ?? "0"),
            lowStockThreshold: String(fd.get("low_stock_threshold") ?? "5"),
            quantityOnHand: String(fd.get("quantity_on_hand") ?? "0"),
            avgUnitCost: String(fd.get("avg_cost") ?? "0"),
            costCurrency: normalizeCurrency(String(fd.get("cost_currency") ?? item.cost_currency)),
            sellingPrice: String(fd.get("sell_price") ?? "") || null,
            sellingPriceCurrency: normalizeCurrency(String(fd.get("price_currency") ?? item.default_price_currency)),
            active: fd.get("active") === "on",
            fxNgnPerUsd: String(fd.get("fx_ngn_usd") ?? "") || null,
            landedUsd: String(fd.get("landed_usd") ?? "") || null,
            storePriceUsd: String(fd.get("store_price_usd") ?? "") || null,
            sellPriceUsd: String(fd.get("sell_price_usd") ?? "") || null,
            sellPriceLd: String(fd.get("sell_price_ld") ?? "") || null,
          });
          if (!r.ok) {
            setErr(r.error.replace(/_/g, " "));
            return;
          }
          router.refresh();
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <p className="text-xs text-white/45">
        Code <span className="font-mono text-white/70">{item.product_code}</span> · Status is calculated from quantity and low-stock threshold (also updated when
        weekly product sales are saved).
      </p>
      <label className="flex items-center gap-2 text-xs text-white/55">
        <input type="checkbox" name="active" defaultChecked={item.active} className="h-4 w-4 rounded border-white/20" />
        Active / for sale
      </label>
      <label className="block text-xs text-white/55">
        Product name
        <input name="product_name" required defaultValue={item.product_name} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          SKU
          <input name="sku" defaultValue={item.sku ?? ""} className={field} />
        </label>
        <label className="block text-xs text-white/55">
          Unit
          <input name="unit" defaultValue={item.unit} className={field} />
        </label>
      </div>
      <label className="block text-xs text-white/55">
        Category
        <input name="category" defaultValue={item.category ?? ""} className={field} />
      </label>
      <label className="block text-xs text-white/55">
        Default supplier
        <select name="supplier_id" defaultValue={item.supplier_id ?? ""} className={field}>
          <option value="">—</option>
          {supplierOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-white/55">
        Notes
        <textarea name="notes" rows={2} defaultValue={item.notes ?? ""} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Quantity on hand
          <input
            name="quantity_on_hand"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.quantity_on_hand}
            className={field}
            required
          />
        </label>
        <label className="block text-xs text-white/55">
          Reorder level
          <input name="reorder_level" type="number" step="0.01" min="0" defaultValue={item.reorder_level} className={field} required />
        </label>
        <label className="block text-xs text-white/55">
          Low stock threshold
          <input
            name="low_stock_threshold"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.low_stock_threshold}
            className={field}
            required
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Average unit cost
          <input name="avg_cost" type="number" step="0.01" min="0" defaultValue={(item.avg_unit_cost_cents / 100).toFixed(2)} className={field} required />
        </label>
        <label className="block text-xs text-white/55">
          Cost currency
          <select name="cost_currency" className={field} defaultValue={item.cost_currency}>
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
            <option value="LRD">LRD</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          Selling price
          <input
            name="sell_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={item.default_unit_price_cents != null ? (item.default_unit_price_cents / 100).toFixed(2) : ""}
            className={field}
          />
        </label>
        <label className="block text-xs text-white/55">
          Price currency
          <select name="price_currency" className={field} defaultValue={item.default_price_currency}>
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
            <option value="LRD">LRD</option>
          </select>
        </label>
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Nigeria → Liberia costing</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          FX (NGN per 1 USD)
          <input
            name="fx_ngn_usd"
            type="number"
            step="0.01"
            min="0"
            className={field}
            defaultValue={item.fx_ngn_per_usd != null ? String(item.fx_ngn_per_usd) : ""}
            placeholder="e.g. 1550"
          />
        </label>
        <label className="block text-xs text-white/55">
          Landed cost (USD / unit)
          <input
            name="landed_usd"
            type="number"
            step="0.01"
            min="0"
            className={field}
            defaultValue={((item.landed_usd_cents_per_unit ?? 0) / 100).toFixed(2)}
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Store price (USD)
          <input
            name="store_price_usd"
            type="number"
            step="0.01"
            min="0"
            className={field}
            defaultValue={item.store_price_usd_cents != null ? (item.store_price_usd_cents / 100).toFixed(2) : ""}
          />
        </label>
        <label className="block text-xs text-white/55">
          Sell price (USD)
          <input
            name="sell_price_usd"
            type="number"
            step="0.01"
            min="0"
            className={field}
            defaultValue={item.sell_price_usd_cents != null ? (item.sell_price_usd_cents / 100).toFixed(2) : ""}
          />
        </label>
        <label className="block text-xs text-white/55">
          Sell price (LD)
          <input
            name="sell_price_ld"
            type="number"
            step="0.01"
            min="0"
            className={field}
            defaultValue={item.sell_price_lrd_cents != null ? (item.sell_price_lrd_cents / 100).toFixed(2) : ""}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--admin-accent)] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50 sm:w-auto"
      >
        {pending ? "Saving…" : "Update product"}
      </button>
    </form>
  );
}
