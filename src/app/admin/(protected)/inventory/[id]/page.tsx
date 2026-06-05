import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SalonInventoryEditForm } from "@/components/admin/salon-inventory-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryItem, type InventoryMovementRow, type SaleRow } from "@/lib/admin/salon-queries";
import { loadInventoryDetailBootstrap, toSupplierOptions } from "@/lib/admin/inventory-form-bootstrap";
import { formatSalonMoney, type StockStatus } from "@/lib/admin/salon-format";
import {
  effectiveUnitCostUsdCents,
  inventoryValueUsdCents,
  ngnKoboToUsdCents,
  resolveOperationalFxFromSettings,
  unitGrossMarginPct,
  unitGrossProfitUsdCents,
} from "@/lib/admin/pricing-engine";
import { cn } from "@/lib/utils";
import { logSalonAdminSupabaseFailure } from "@/lib/admin/admin-supabase-debug";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function movementTypeLabel(t: InventoryMovementRow["movement_type"]): string {
  const map: Record<InventoryMovementRow["movement_type"], string> = {
    purchase: "Purchase",
    retail_sale: "Retail sale",
    service_usage: "Service usage",
    manual_adjustment: "Manual adjustment",
    correction: "Correction",
    damaged: "Damaged",
    expired: "Expired",
    restock: "Restock",
    opening_balance: "Opening balance",
    sale_edit_restore: "Sale edit (restore)",
    sale_edit_deduct: "Sale edit (deduct)",
    catalog_reset: "Catalog reset",
  };
  return map[t] ?? t;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const supabase = await createSupabaseServerClient();
    const row = await fetchInventoryItem(supabase, id);
    return { title: row?.product_name ?? `Product ${id.slice(0, 8)}…` };
  } catch (e) {
    logSalonAdminSupabaseFailure("metadata:admin/inventory/[id]", e, { inventoryItemId: id });
    return { title: `Product ${id.slice(0, 8)}…` };
  }
}

export default async function AdminInventoryDetailPage({ params }: Props) {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { item, suppliers, sales, movements, corrections, settings, fxSummaryLine, loadErrors } =
    await loadInventoryDetailBootstrap(supabase, id);

  if (!item) notFound();

  const opRates = resolveOperationalFxFromSettings(settings);
  const supplierOptions = toSupplierOptions(suppliers);

  const st = item.stock_status as StockStatus | null;
  const badgeCls =
    st === "in_stock"
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
      : st === "low_stock"
        ? "bg-amber-500/15 text-amber-100 ring-amber-500/35"
        : st === "out_of_stock"
          ? "bg-red-500/15 text-red-100 ring-red-500/35"
          : "bg-white/5 text-white/50 ring-white/10";
  const badgeLabel =
    st === "in_stock" ? "In stock" : st === "low_stock" ? "Low stock" : st === "out_of_stock" ? "Out of stock" : "—";

  const usdUnit = effectiveUnitCostUsdCents(item);
  const invVal = inventoryValueUsdCents(item);
  const grossUnit = unitGrossProfitUsdCents(item);
  const marginPct = unitGrossMarginPct(item);
  const fxNgn = item.fx_ngn_per_usd != null && item.fx_ngn_per_usd > 0 ? Number(item.fx_ngn_per_usd) : opRates.ngnPerUsd;
  const landedAddonUsdCents = item.landed_usd_cents_per_unit ?? 0;
  let supplierUsdOnlyCents = 0;
  if (item.cost_currency === "NGN") supplierUsdOnlyCents = ngnKoboToUsdCents(item.avg_unit_cost_cents, fxNgn);
  else if (item.cost_currency === "USD") supplierUsdOnlyCents = Math.round(item.avg_unit_cost_cents);
  else if (item.cost_currency === "LRD") supplierUsdOnlyCents = Math.round(item.avg_unit_cost_cents / opRates.lrdPerUsd);
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <Link href="/admin/inventory" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Inventory
      </Link>
      {loadErrors.length > 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          Some sections could not be loaded ({loadErrors.join(", ")}). Check server logs for{" "}
          <code className="text-[11px]">[admin-debug]</code> entries.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-mono text-white/50">{item.product_code}</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">{item.product_name}</h1>
        </div>
        <span
          className={cn(
            "inline-flex w-fit rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1",
            badgeCls,
          )}
        >
          {badgeLabel}
        </span>
      </div>

      <section className="admin-card space-y-4 p-6 text-sm">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Unit economics (pricing ladder)</h2>
        <p className="text-[11px] text-white/35">
          Supplier → FX → landed USD → wholesale → retail → gross profit. WAC is the cost basis used for sale margins and dashboard GP.
          {item.weighted_avg_landed_usd_cents != null && item.weighted_avg_landed_usd_cents > 0 ? (
            <span className="mt-1 block text-[var(--admin-accent)]/90">
              Weighted-average landed cost from received purchases is active — the “Landed (WAC)” row is the authoritative unit cost.
            </span>
          ) : null}
        </p>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Supplier unit cost</dt>
            <dd className="mt-1 text-white">{formatSalonMoney(item.avg_unit_cost_cents, item.cost_currency)}</dd>
          </div>
          {item.cost_currency === "NGN" ? (
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">FX (NGN / USD)</dt>
              <dd className="mt-1 text-white">{Math.round(fxNgn).toLocaleString()}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Supplier → USD (excl. landed)</dt>
            <dd className="mt-1 text-white">{formatSalonMoney(supplierUsdOnlyCents, "USD")}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Landed uplift (USD / unit)</dt>
            <dd className="mt-1 text-white">{formatSalonMoney(landedAddonUsdCents, "USD")}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Landed (WAC) USD / unit</dt>
            <dd className="mt-1 text-white">{formatSalonMoney(usdUnit, "USD")}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Wholesale USD</dt>
            <dd className="mt-1 text-white">{item.store_price_usd_cents != null ? formatSalonMoney(item.store_price_usd_cents, "USD") : "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Retail USD</dt>
            <dd className="mt-1 text-white">{item.sell_price_usd_cents != null ? formatSalonMoney(item.sell_price_usd_cents, "USD") : "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Retail LRD</dt>
            <dd className="mt-1 text-white">{item.sell_price_lrd_cents != null ? formatSalonMoney(item.sell_price_lrd_cents, "LRD") : "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Gross profit / unit (USD)</dt>
            <dd className="mt-1 text-white">{grossUnit != null ? formatSalonMoney(grossUnit, "USD") : "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Margin (retail USD)</dt>
            <dd className="mt-1 text-[var(--admin-accent)]">{marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Qty on hand</dt>
            <dd className="mt-1 text-white">
              {item.quantity_on_hand} {item.unit}
            </dd>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-[10px] uppercase tracking-[0.14em] text-white/40">Inventory value (USD, at WAC)</dt>
            <dd className="mt-1 text-white">{formatSalonMoney(invVal, "USD")}</dd>
          </div>
        </dl>
        {staff ? (
          <p className="text-xs text-amber-200/80">
            Staff view — inventory quantity, pricing, FX, WAC, and archive controls are restricted to managers and owners.
          </p>
        ) : null}
      </section>

      {!staff && (corrections ?? []).length > 0 ? (
        <section className="admin-card p-6">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Admin correction history</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {(corrections ?? []).map((c) => (
              <li key={c.id} className="border-b border-white/[0.06] pb-3 text-white/75">
                <p className="font-medium text-white">{c.audit_reason}</p>
                <p className="mt-1 text-[11px] text-white/45">{new Date(c.created_at).toLocaleString()}</p>
                {c.quantity_before != null && c.quantity_after != null && c.quantity_before !== c.quantity_after ? (
                  <p className="mt-1 text-[11px] text-white/50">
                    Qty {c.quantity_before} → {c.quantity_after}
                    {c.movement_type ? ` · ${movementTypeLabel(c.movement_type as InventoryMovementRow["movement_type"])}` : ""}
                  </p>
                ) : null}
                {c.sell_price_usd_cents_before !== c.sell_price_usd_cents_after ? (
                  <p className="text-[11px] text-white/50">
                    Retail USD{" "}
                    {c.sell_price_usd_cents_before != null ? formatSalonMoney(c.sell_price_usd_cents_before, "USD") : "—"} →{" "}
                    {c.sell_price_usd_cents_after != null ? formatSalonMoney(c.sell_price_usd_cents_after, "USD") : "—"}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="admin-card p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Recent stock movements</h2>
        <p className="mt-1 text-[11px] text-white/35">
          Quantity changes from sales, services, purchases, and manual updates (operational ledger).
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {(movements ?? []).length === 0 ? <li className="text-white/45">No movements recorded yet for this product.</li> : null}
          {(movements ?? []).map((m) => {
            const ch = Number(m.quantity_change);
            const sign = ch > 0 ? "+" : "";
            return (
              <li
                key={m.id}
                className="flex flex-col gap-1 border-b border-white/[0.06] py-2 text-white/75 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between"
              >
                <span className="font-medium text-white">
                  {movementTypeLabel(m.movement_type)}
                  <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-white/40">
                    {Number(m.quantity_before)} → {Number(m.quantity_after)} ({sign}
                    {ch})
                  </span>
                </span>
                <span className="text-[11px] text-white/45">{new Date(m.created_at).toLocaleString()}</span>
                {m.notes ? <span className="w-full text-[11px] text-white/40">{m.notes}</span> : null}
              </li>
            );
          })}
        </ul>
      </section>

      {!staff ? <SalonInventoryEditForm item={item} supplierOptions={supplierOptions} fxSummaryLine={fxSummaryLine} /> : null}

      <section className="admin-card p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Recent retail sales</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {(sales ?? []).length === 0 ? <li className="text-white/45">No sales logged for this SKU yet.</li> : null}
          {(sales ?? []).map((s: SaleRow) => {
            const rev = Math.round(s.qty * s.unit_price_cents);
            const gpUsd = s.gross_profit_usd_cents;
            const gpLegacy = Math.round(s.qty * (s.unit_price_cents - s.unit_cost_cents));
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] py-2 text-white/75">
                <span>
                  {s.qty} × {formatSalonMoney(s.unit_price_cents, s.currency)} · {new Date(s.sold_at).toLocaleString()}
                </span>
                <span className="flex flex-wrap items-center gap-3 text-white/55">
                  <span>
                    Rev {formatSalonMoney(rev, s.currency)}
                    {gpUsd != null ? ` · GP ${formatSalonMoney(gpUsd, "USD")} USD` : ` · GP ${formatSalonMoney(gpLegacy, s.currency)}`}
                  </span>
                  {!staff ? (
                    <Link
                      href={`/admin/sales/${s.id}/edit`}
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                    >
                      Edit
                    </Link>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
