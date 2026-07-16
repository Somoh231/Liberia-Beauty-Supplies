"use client";

import { editRetailSaleAction } from "@/app/actions/admin-salon";
import type { InventoryItemRow, RetailSaleListRow } from "@/lib/admin/salon-queries";
import { normalizeCurrency } from "@/lib/admin/salon-format";
import { sanitizeAdminReturnTo } from "@/lib/admin/safe-admin-return-to";
import { InventoryProductTypeaheadSelect } from "@/components/admin/inventory-product-typeahead";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

function errMsg(code: string): string {
  const map: Record<string, string> = {
    edit_reason_required: "Edit reason is required (at least 3 characters).",
    insufficient_stock: "Not enough stock for this quantity after adjustment.",
    invalid_quantity: "Invalid quantity.",
    invalid_qty: "Invalid quantity.",
    invalid_price: "Invalid unit price.",
    invalid_currency: "Invalid currency.",
    invalid_date: "Invalid sale date.",
    unauthorized: "Only managers and owners can edit sales.",
    forbidden_manager_required: "Only managers and owners can edit sales.",
    migration_required:
      "Sale edit requires migration 20260525120000_operational_clean_restart.sql (or 20260523120000) on Supabase.",
    sale_not_found: "Sale not found.",
    product_not_found: "Product not found or archived replacement is not allowed.",
    product_needs_setup: "That product still needs setup and cannot be sold yet.",
    product_not_sellable: "That product is an asset and cannot be sold.",
    product_missing_retail_price: "Sale price must be greater than zero.",
    not_found: "Sale or product not found.",
    transaction_failed: "Sale edit failed and was rolled back. Try again or contact support.",
  };
  return map[code] ?? code.replace(/_/g, " ");
}

export function SalonSaleEditForm({
  sale,
  items,
  returnTo = "/admin/sales-log",
}: {
  sale: RetailSaleListRow;
  items: InventoryItemRow[];
  returnTo?: string;
}) {
  const router = useRouter();
  const safeReturnTo = sanitizeAdminReturnTo(returnTo);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [itemId, setItemId] = useState(sale.inventory_item_id);
  const [qty, setQty] = useState(String(sale.qty));
  const [unitPrice, setUnitPrice] = useState((sale.unit_price_cents / 100).toFixed(2));
  const [currency, setCurrency] = useState(sale.currency);
  const [saleDate, setSaleDate] = useState(sale.sold_at.slice(0, 10));
  const [customerName, setCustomerName] = useState(sale.customer_name ?? "");
  const [notes, setNotes] = useState(sale.notes ?? "");
  const [editReason, setEditReason] = useState("");

  return (
    <form
      className="admin-card space-y-5 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        start(async () => {
          const r = await editRetailSaleAction({
            saleId: sale.id,
            inventoryItemId: itemId,
            qty,
            unitPrice,
            currency: normalizeCurrency(currency),
            saleDate,
            customerName: customerName || null,
            notes: notes || null,
            editReason,
          });
          if (!r.ok) {
            setErr(errMsg(r.error));
            return;
          }
          router.push(safeReturnTo);
          router.refresh();
        });
      }}
    >
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        Editing a sale may adjust inventory and reports. Stock is restored for the original line, then deducted for the
        updated line. All changes are audited.
      </div>

      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      <label className="block text-xs text-white/55">
        Edit reason (required)
        <input
          className={field}
          value={editReason}
          onChange={(e) => setEditReason(e.target.value)}
          placeholder="e.g. Wrong qty entered at register"
          required
          minLength={3}
        />
      </label>

      <label className="block text-xs text-white/55">
        Sale date
        <input type="date" className={field} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
      </label>

      <label className="block text-xs text-white/55">
        Product
        <InventoryProductTypeaheadSelect
          items={items}
          value={itemId}
          placeholder="—"
          inputClassName={field}
          onValueChange={setItemId}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Quantity
          <input className={field} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </label>
        <label className="block text-xs text-white/55">
          Unit price
          <input
            className={field}
            inputMode="decimal"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            required
          />
        </label>
        <label className="block text-xs text-white/55">
          Currency
          <select
            className={field}
            value={currency}
            onChange={(e) => setCurrency(normalizeCurrency(e.target.value))}
          >
            <option value="USD">USD</option>
            <option value="LRD">LRD</option>
            <option value="NGN">NGN</option>
          </select>
        </label>
      </div>

      <label className="block text-xs text-white/55">
        Customer (optional)
        <input className={field} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      </label>

      <label className="block text-xs text-white/55">
        Notes (optional)
        <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending || !itemId}
          className="admin-btn-primary min-h-[2.75rem] rounded-full px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save sale changes"}
        </button>
      </div>
    </form>
  );
}
