"use client";

import { createInventoryItemAction, updateInventoryItemAction } from "@/app/actions/admin-salon";
import type { InventoryItemRow } from "@/lib/admin/salon-queries";
import { normalizeCurrency, type SalonCurrency } from "@/lib/admin/salon-format";
import { InventoryPricingLivePreview } from "@/components/admin/inventory-pricing-live-preview";
import { OperationalFxBanner } from "@/components/admin/operational-fx-banner";
import type { InventoryMovementType } from "@/lib/admin/inventory-admin-correction";
import {
  inventoryCostingFromFormMajors,
  isInvalidManualNgnPerUsdField,
  unitGrossProfitUsdCents,
} from "@/lib/admin/pricing-engine";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

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

export function SalonInventoryNewForm({
  supplierOptions,
  fxSummaryLine,
}: {
  supplierOptions: { id: string; name: string }[];
  fxSummaryLine?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [avgCost, setAvgCost] = useState("0");
  const [costCurrency, setCostCurrency] = useState<SalonCurrency>("NGN");
  const [fxNgn, setFxNgn] = useState("");
  const [landedUsd, setLandedUsd] = useState("0");
  const [storeUsd, setStoreUsd] = useState("");
  const [sellUsd, setSellUsd] = useState("");
  const [sellLrd, setSellLrd] = useState("");
  const [openingQty, setOpeningQty] = useState("0");

  return (
    <form
      className="admin-card relative max-w-2xl space-y-4 overflow-visible p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (isInvalidManualNgnPerUsdField(fxNgn)) {
          setErr("FX must be blank or greater than zero.");
          return;
        }
        const draft = inventoryCostingFromFormMajors({
          avgUnitCostMajor: Number.parseFloat(avgCost) || 0,
          costCurrency,
          fxNgnPerUsdText: fxNgn,
          landedUsdMajor: Number.parseFloat(landedUsd) || 0,
          sellUsdMajor: Number.parseFloat(sellUsd) || 0,
          sellLrdMajor: Number.parseFloat(sellLrd) || 0,
          storeUsdMajor: Number.parseFloat(storeUsd) || 0,
          postedWacUsdCents: null,
        });
        const gpPre = unitGrossProfitUsdCents(draft);
        if (gpPre != null && gpPre < 0) {
          if (!window.confirm("Retail USD is below unit cost for this product. Save anyway?")) return;
        }
        const oq = Number.parseFloat(openingQty === "" ? "0" : openingQty);
        if (!Number.isFinite(oq) || oq < 0) {
          setErr("Opening quantity cannot be negative.");
          return;
        }
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
          <input
            name="opening_qty"
            type="number"
            step="0.01"
            min="0"
            value={openingQty}
            onChange={(e) => {
              const v = e.target.value;
              const n = Number.parseFloat(v);
              if (v === "" || (Number.isFinite(n) && n >= 0)) setOpeningQty(v === "" ? "" : v);
            }}
            className={field}
          />
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
          Supplier unit cost (avg)
          <input
            name="avg_cost"
            type="number"
            step="0.01"
            min="0"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            className={field}
            required
          />
        </label>
        <label className="block text-xs text-white/55">
          Cost currency
          <select
            name="cost_currency"
            className={field}
            value={costCurrency}
            onChange={(e) => setCostCurrency(normalizeCurrency(e.target.value))}
          >
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
            <option value="LRD">LRD</option>
          </select>
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Pricing ladder — supplier to retail (optional)</p>
      <OperationalFxBanner summaryLine={fxSummaryLine} />
      <p className="text-[11px] text-white/35">Leave FX blank on NGN rows to use the central ₦/USD rate shown above.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs text-white/55">
          FX (NGN per 1 USD)
          <input
            name="fx_ngn_usd"
            type="number"
            step="0.01"
            min="0"
            value={fxNgn}
            onChange={(e) => setFxNgn(e.target.value)}
            className={field}
            placeholder="e.g. 1385"
          />
        </label>
        <label className="block text-xs text-white/55">
          Landed cost (USD / unit)
          <input
            name="landed_usd"
            type="number"
            step="0.01"
            min="0"
            value={landedUsd}
            onChange={(e) => setLandedUsd(e.target.value)}
            className={field}
            placeholder="0"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Wholesale / store (USD)
          <input
            name="store_price_usd"
            type="number"
            step="0.01"
            min="0"
            value={storeUsd}
            onChange={(e) => setStoreUsd(e.target.value)}
            className={field}
          />
        </label>
        <label className="block text-xs text-white/55">
          Sell price (USD)
          <input
            name="sell_price_usd"
            type="number"
            step="0.01"
            min="0"
            value={sellUsd}
            onChange={(e) => setSellUsd(e.target.value)}
            className={field}
          />
        </label>
        <label className="block text-xs text-white/55">
          Sell price (LD)
          <input
            name="sell_price_ld"
            type="number"
            step="0.01"
            min="0"
            value={sellLrd}
            onChange={(e) => setSellLrd(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <InventoryPricingLivePreview
        avgCostMajorStr={avgCost}
        costCurrency={costCurrency}
        fxNgnText={fxNgn}
        landedUsdMajorStr={landedUsd}
        sellUsdMajorStr={sellUsd}
        sellLrdMajorStr={sellLrd}
        storeUsdMajorStr={storeUsd}
        postedWacUsdCents={null}
        quantityMajorStr={openingQty === "" ? "0" : openingQty}
      />
      <div className="sticky bottom-0 z-10 -mx-6 mt-2 border-t border-white/[0.08] bg-gradient-to-t from-black via-black/95 to-black/80 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <button
          type="submit"
          disabled={pending}
          className="admin-btn-primary w-full rounded-full px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50 sm:w-auto"
        >
          {pending ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}

export function SalonInventoryEditForm({
  item,
  supplierOptions,
  fxSummaryLine,
}: {
  item: InventoryItemRow;
  supplierOptions: { id: string; name: string }[];
  fxSummaryLine?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [avgCost, setAvgCost] = useState(() => (item.avg_unit_cost_cents / 100).toFixed(2));
  const [costCurrency, setCostCurrency] = useState<SalonCurrency>(() => item.cost_currency);
  const [fxNgn, setFxNgn] = useState(() => (item.fx_ngn_per_usd != null ? String(item.fx_ngn_per_usd) : ""));
  const [landedUsd, setLandedUsd] = useState(() => ((item.landed_usd_cents_per_unit ?? 0) / 100).toFixed(2));
  const [storeUsd, setStoreUsd] = useState(() =>
    item.store_price_usd_cents != null ? (item.store_price_usd_cents / 100).toFixed(2) : "",
  );
  const [sellUsd, setSellUsd] = useState(() =>
    item.sell_price_usd_cents != null ? (item.sell_price_usd_cents / 100).toFixed(2) : "",
  );
  const [sellLrd, setSellLrd] = useState(() =>
    item.sell_price_lrd_cents != null ? (item.sell_price_lrd_cents / 100).toFixed(2) : "",
  );
  const [qtyHand, setQtyHand] = useState(() => String(item.quantity_on_hand));
  const [wacUsd, setWacUsd] = useState(() =>
    item.weighted_avg_landed_usd_cents != null && item.weighted_avg_landed_usd_cents > 0
      ? (item.weighted_avg_landed_usd_cents / 100).toFixed(2)
      : "",
  );
  const [archived, setArchived] = useState(() => item.deleted_at != null);
  const [auditReason, setAuditReason] = useState("");

  useEffect(() => {
    setAvgCost((item.avg_unit_cost_cents / 100).toFixed(2));
    setCostCurrency(item.cost_currency);
    setFxNgn(item.fx_ngn_per_usd != null ? String(item.fx_ngn_per_usd) : "");
    setLandedUsd(((item.landed_usd_cents_per_unit ?? 0) / 100).toFixed(2));
    setStoreUsd(item.store_price_usd_cents != null ? (item.store_price_usd_cents / 100).toFixed(2) : "");
    setSellUsd(item.sell_price_usd_cents != null ? (item.sell_price_usd_cents / 100).toFixed(2) : "");
    setSellLrd(item.sell_price_lrd_cents != null ? (item.sell_price_lrd_cents / 100).toFixed(2) : "");
    setQtyHand(String(item.quantity_on_hand));
    setWacUsd(
      item.weighted_avg_landed_usd_cents != null && item.weighted_avg_landed_usd_cents > 0
        ? (item.weighted_avg_landed_usd_cents / 100).toFixed(2)
        : "",
    );
    setArchived(item.deleted_at != null);
  }, [item]);

  const needsAuditReason = useMemo(() => {
    const qh = Number.parseFloat(qtyHand === "" ? "0" : qtyHand);
    const costCents = Math.round((Number.parseFloat(avgCost) || 0) * 100);
    const sellUsdCents =
      sellUsd !== "" ? Math.round(Number.parseFloat(sellUsd) * 100) : item.sell_price_usd_cents;
    const wacCents = wacUsd !== "" ? Math.round(Number.parseFloat(wacUsd) * 100) : item.weighted_avg_landed_usd_cents ?? 0;
    const fxVal = fxNgn !== "" ? Number.parseFloat(fxNgn) : item.fx_ngn_per_usd;
    const qtyChanged = qh !== item.quantity_on_hand;
    const pricingChanged =
      costCents !== item.avg_unit_cost_cents ||
      costCurrency !== item.cost_currency ||
      sellUsdCents !== item.sell_price_usd_cents ||
      wacCents !== (item.weighted_avg_landed_usd_cents ?? 0) ||
      fxVal !== item.fx_ngn_per_usd;
    const statusChanged = archived !== (item.deleted_at != null);
    return qtyChanged || pricingChanged || statusChanged;
  }, [avgCost, costCurrency, fxNgn, item, qtyHand, sellUsd, wacUsd, archived]);

  const postedWac =
    item.weighted_avg_landed_usd_cents != null && item.weighted_avg_landed_usd_cents > 0
      ? item.weighted_avg_landed_usd_cents
      : null;

  return (
    <form
      className="admin-card relative max-w-2xl space-y-4 overflow-visible p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (isInvalidManualNgnPerUsdField(fxNgn)) {
          setErr("FX must be blank or greater than zero.");
          return;
        }
        const draft = inventoryCostingFromFormMajors({
          avgUnitCostMajor: Number.parseFloat(avgCost) || 0,
          costCurrency,
          fxNgnPerUsdText: fxNgn,
          landedUsdMajor: Number.parseFloat(landedUsd) || 0,
          sellUsdMajor: Number.parseFloat(sellUsd) || 0,
          sellLrdMajor: Number.parseFloat(sellLrd) || 0,
          storeUsdMajor: Number.parseFloat(storeUsd) || 0,
        postedWacUsdCents: wacUsd !== "" ? Math.round(Number.parseFloat(wacUsd) * 100) : postedWac,
        });
        const gpPre = unitGrossProfitUsdCents(draft);
        if (gpPre != null && gpPre < 0) {
          if (!window.confirm("Retail USD is below unit cost (at posted WAC when applicable). Save anyway?")) return;
        }
        const qh = Number.parseFloat(qtyHand === "" ? "0" : qtyHand);
        if (!Number.isFinite(qh) || qh < 0) {
          setErr("Quantity on hand cannot be negative.");
          return;
        }
        const fd = new FormData(e.currentTarget);
        const reason = String(fd.get("audit_reason") ?? "").trim();
        if (needsAuditReason && reason.length < 3) {
          setErr("A short correction reason is required when quantity, pricing, or archive status changes.");
          return;
        }
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
            archived: fd.get("archived") === "on",
            isAddon: fd.get("is_addon") === "on",
            fxNgnPerUsd: String(fd.get("fx_ngn_usd") ?? "") || null,
            landedUsd: String(fd.get("landed_usd") ?? "") || null,
            storePriceUsd: String(fd.get("store_price_usd") ?? "") || null,
            sellPriceUsd: String(fd.get("sell_price_usd") ?? "") || null,
            sellPriceLd: String(fd.get("sell_price_ld") ?? "") || null,
            wacUsdOverride: String(fd.get("wac_usd") ?? "") || null,
            movementType: (String(fd.get("movement_type") ?? "correction") as InventoryMovementType),
            auditReason: reason || null,
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
      <div className="rounded-xl border border-[var(--admin-accent)]/25 bg-[var(--admin-accent)]/[0.06] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-accent)]">Admin correction</p>
        <p className="mt-1 text-xs text-white/55">
          Manager/owner edits are logged with before/after values. Quantity changes create movement ledger entries.
        </p>
        {item.import_batch_id ? (
          <p className="mt-2 font-mono text-[10px] text-white/40">Import batch {item.import_batch_id}</p>
        ) : null}
      </div>
      <p className="text-xs text-white/45">
        Code <span className="font-mono text-white/70">{item.product_code}</span> · Status is calculated from quantity and low-stock threshold.
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Product status</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-white/55">
          <input type="checkbox" name="active" defaultChecked={item.active} className="h-4 w-4 rounded border-white/20" />
          Active / for sale
        </label>
        <label className="flex items-center gap-2 text-xs text-white/55">
          <input
            type="checkbox"
            name="archived"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
            className="h-4 w-4 rounded border-white/20"
          />
          Archived (soft delete)
        </label>
        <label className="flex items-center gap-2 text-xs text-white/55">
          <input type="checkbox" name="is_addon" defaultChecked={item.is_addon ?? false} className="h-4 w-4 rounded border-white/20" />
          Add-on SKU
        </label>
      </div>
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
      {item.last_override_reason ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/50">
          <span className="font-semibold text-white/65">Last override:</span> {item.last_override_reason}
          {item.last_override_at ? ` · ${new Date(item.last_override_at).toLocaleString()}` : ""}
        </p>
      ) : null}
      <label className="block text-xs text-white/55">
        Correction reason
        {needsAuditReason ? <span className="ml-1 text-[var(--admin-accent)]">(required)</span> : null}
        <textarea
          name="audit_reason"
          rows={2}
          value={auditReason}
          onChange={(e) => setAuditReason(e.target.value)}
          className={field}
          placeholder="e.g. recount correction, supplier price update, import correction, damaged stock"
        />
      </label>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Inventory adjustment</p>
      <label className="block text-xs text-white/55">
        Movement type (when quantity changes)
        <select name="movement_type" className={field} defaultValue="correction">
          <option value="correction">Correction</option>
          <option value="manual_adjustment">Manual adjustment</option>
          <option value="damaged">Damaged</option>
          <option value="expired">Expired</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Quantity on hand
          <input
            name="quantity_on_hand"
            type="number"
            step="0.01"
            min="0"
            value={qtyHand}
            onChange={(e) => {
              const v = e.target.value;
              const n = Number.parseFloat(v);
              if (v === "" || (Number.isFinite(n) && n >= 0)) setQtyHand(v === "" ? "" : v);
            }}
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
          Supplier unit cost (avg)
          <input
            name="avg_cost"
            type="number"
            step="0.01"
            min="0"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            className={field}
            required
          />
        </label>
        <label className="block text-xs text-white/55">
          Cost currency
          <select
            name="cost_currency"
            className={field}
            value={costCurrency}
            onChange={(e) => setCostCurrency(normalizeCurrency(e.target.value))}
          >
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Price override — supplier to retail</p>
      <OperationalFxBanner summaryLine={fxSummaryLine} />
      <p className="text-[11px] text-white/35">Leave FX blank on NGN rows to use the central ₦/USD rate shown above. Posted WAC from purchases overrides book cost for sale margins.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          FX (NGN per 1 USD)
          <input
            name="fx_ngn_usd"
            type="number"
            step="0.01"
            min="0"
            className={field}
            value={fxNgn}
            onChange={(e) => setFxNgn(e.target.value)}
            placeholder="e.g. 1385"
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
            value={landedUsd}
            onChange={(e) => setLandedUsd(e.target.value)}
          />
        </label>
        <label className="block text-xs text-white/55">
          WAC override (USD / unit)
          <input
            name="wac_usd"
            type="number"
            step="0.01"
            min="0"
            className={field}
            value={wacUsd}
            onChange={(e) => setWacUsd(e.target.value)}
            placeholder="Posted WAC if blank"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-xs text-white/55">
          Wholesale / store (USD)
          <input
            name="store_price_usd"
            type="number"
            step="0.01"
            min="0"
            className={field}
            value={storeUsd}
            onChange={(e) => setStoreUsd(e.target.value)}
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
            value={sellUsd}
            onChange={(e) => setSellUsd(e.target.value)}
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
            value={sellLrd}
            onChange={(e) => setSellLrd(e.target.value)}
          />
        </label>
      </div>
      <InventoryPricingLivePreview
        avgCostMajorStr={avgCost}
        costCurrency={costCurrency}
        fxNgnText={fxNgn}
        landedUsdMajorStr={landedUsd}
        sellUsdMajorStr={sellUsd}
        sellLrdMajorStr={sellLrd}
        storeUsdMajorStr={storeUsd}
        postedWacUsdCents={postedWac}
        quantityMajorStr={qtyHand === "" ? "0" : qtyHand}
      />
      <div className="sticky bottom-0 z-10 -mx-6 mt-2 border-t border-white/[0.08] bg-gradient-to-t from-black via-black/95 to-black/80 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        <button
          type="submit"
          disabled={pending}
          className="admin-btn-primary w-full rounded-full px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50 sm:w-auto"
        >
          {pending ? "Saving…" : "Save admin correction"}
        </button>
      </div>
    </form>
  );
}
