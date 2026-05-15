import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SalonInventoryEditForm } from "@/components/admin/salon-inventory-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryItem, fetchSalesForItem, fetchSuppliers, type SaleRow } from "@/lib/admin/salon-queries";
import { formatSalonMoney, type StockStatus } from "@/lib/admin/salon-format";
import { effectiveUnitCostUsdCents, inventoryValueUsdCents, unitGrossProfitUsdCents } from "@/lib/admin/salon-finance";
import { cn } from "@/lib/utils";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const row = await fetchInventoryItem(supabase, id);
  return { title: row?.product_name ?? `Product ${id.slice(0, 8)}…` };
}

export default async function AdminInventoryDetailPage({ params }: Props) {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [item, suppliers, sales] = await Promise.all([
    fetchInventoryItem(supabase, id),
    fetchSuppliers(supabase),
    fetchSalesForItem(supabase, id, 25),
  ]);

  if (!item) notFound();

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

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10">
      <Link href="/admin/inventory" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Inventory
      </Link>
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

      {staff ? (
        <section className="admin-card grid gap-4 p-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Quantity</p>
            <p className="mt-1 text-white">
              {item.quantity_on_hand} {item.unit}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Unit cost (USD equiv.)</p>
            <p className="mt-1 text-white">{formatSalonMoney(usdUnit, "USD")}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Inventory value (USD)</p>
            <p className="mt-1 text-white">{formatSalonMoney(invVal, "USD")}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Gross profit / unit (USD)</p>
            <p className="mt-1 text-white">{grossUnit != null ? formatSalonMoney(grossUnit, "USD") : "—"}</p>
          </div>
          <p className="sm:col-span-2 text-xs text-white/45">Inventory edits are limited to managers and owners.</p>
        </section>
      ) : (
        <SalonInventoryEditForm item={item} supplierOptions={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
      )}

      <section className="admin-card p-6">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Recent retail sales</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {sales.length === 0 ? <li className="text-white/45">No sales logged for this SKU yet.</li> : null}
          {sales.map((s: SaleRow) => {
            const rev = Math.round(s.qty * s.unit_price_cents);
            const gpUsd = s.gross_profit_usd_cents;
            const gpLegacy = Math.round(s.qty * (s.unit_price_cents - s.unit_cost_cents));
            return (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 border-b border-white/[0.06] py-2 text-white/75">
                <span>
                  {s.qty} × {formatSalonMoney(s.unit_price_cents, s.currency)} · {new Date(s.sold_at).toLocaleString()}
                </span>
                <span className="text-white/55">
                  Rev {formatSalonMoney(rev, s.currency)}
                  {gpUsd != null ? ` · GP ${formatSalonMoney(gpUsd, "USD")} USD` : ` · GP ${formatSalonMoney(gpLegacy, s.currency)}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
