import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchDashboardRollup,
  fetchRecentActivity,
  fetchTopMarginProducts,
  fetchLowStockAlerts,
  fetchTodayRevenueSnapshot,
  fetchSaleLogAnalytics,
  fetchDashboardTrustSignals,
  fetchInventorySetupProgress,
} from "@/lib/admin/salon-queries";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";
import Link from "next/link";
import { Boxes, TrendingUp, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminDashboardCharts } from "@/components/admin/admin-dashboard-charts";

function buildRevenueTrendSeries(
  product: Record<string, number>,
  service: Record<string, number>,
  tailDays: number,
) {
  const keys = [...new Set([...Object.keys(product), ...Object.keys(service)])].sort();
  const tail = keys.slice(-tailDays);
  return tail.map((day) => ({
    day,
    retail: product[day] ?? 0,
    service: service[day] ?? 0,
  }));
}

function buildGrossProfitSeries(gpByDay: Record<string, number>, tailDays: number) {
  const keys = Object.keys(gpByDay).sort().slice(-tailDays);
  return keys.map((day) => ({ day, gp: gpByDay[day] ?? 0 }));
}

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);

  let err: string | null = null;
  let rollup: Awaited<ReturnType<typeof fetchDashboardRollup>> | null = null;
  let activity: Awaited<ReturnType<typeof fetchRecentActivity>> = [];
  let margins: Awaited<ReturnType<typeof fetchTopMarginProducts>> = [];
  let lowStock: Awaited<ReturnType<typeof fetchLowStockAlerts>> = [];
  let today: Awaited<ReturnType<typeof fetchTodayRevenueSnapshot>> | null = null;
  let topProducts: Awaited<ReturnType<typeof fetchSaleLogAnalytics>>["topProducts"] = [];
  let topServices: Awaited<ReturnType<typeof fetchSaleLogAnalytics>>["topServices"] = [];
  let saleLogAnalytics: Awaited<ReturnType<typeof fetchSaleLogAnalytics>> | null = null;
  let trust: Awaited<ReturnType<typeof fetchDashboardTrustSignals>> | null = null;
  let setupProgress: Awaited<ReturnType<typeof fetchInventorySetupProgress>> | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const [r, act, m, ls, t, analytics, tr, setup] = await Promise.all([
      fetchDashboardRollup(supabase),
      fetchRecentActivity(supabase, 10),
      fetchTopMarginProducts(supabase, 5),
      fetchLowStockAlerts(supabase, 8),
      fetchTodayRevenueSnapshot(supabase),
      fetchSaleLogAnalytics(supabase),
      fetchDashboardTrustSignals(supabase),
      fetchInventorySetupProgress(supabase),
    ]);
    rollup = r;
    activity = act;
    margins = m;
    lowStock = ls;
    today = t;
    saleLogAnalytics = analytics;
    topProducts = analytics.topProducts.slice(0, 5);
    topServices = analytics.topServices.slice(0, 5);
    trust = tr;
    setupProgress = setup;
  } catch (e) {
    err = e instanceof Error ? e.message : "Could not load dashboard.";
  }

  const monthCombined =
    (rollup?.totalsLast30.productRevenueUsd ?? 0) + (rollup?.totalsLast30.serviceRevenueUsd ?? 0);
  const y0 = new Date().getFullYear();
  const ytdCombined = rollup
    ? Object.keys(rollup.productRevenueUsdByDay)
        .filter((d) => d.startsWith(`${y0}-`))
        .reduce((a, d) => a + (rollup!.productRevenueUsdByDay[d] ?? 0), 0) +
      Object.keys(rollup.serviceRevenueUsdByDay)
        .filter((d) => d.startsWith(`${y0}-`))
        .reduce((a, d) => a + (rollup!.serviceRevenueUsdByDay[d] ?? 0), 0)
    : 0;
  const grossProfit30d = rollup?.totalsLast30.productGrossProfitUsd ?? 0;

  const chartPayload =
    rollup && saleLogAnalytics
      ? {
          revenueTrend: buildRevenueTrendSeries(rollup.productRevenueUsdByDay, rollup.serviceRevenueUsdByDay, 62),
          grossProfitTrend: buildGrossProfitSeries(rollup.productGrossProfitUsdByDay, 62),
          topProductsByQty: saleLogAnalytics.topProductsByQty.map((p) => ({ name: p.name, qty: p.qty })),
          serviceMix: saleLogAnalytics.serviceCategoryMixLast30,
          inventoryHealth: {
            in_stock: rollup.inStockCount,
            low_stock: rollup.lowStockCount,
            out_of_stock: rollup.outOfStockCount,
          },
        }
      : null;

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
          Command center
        </h1>
        <p className="max-w-2xl text-sm text-white/50">Stock, sales, and services at a glance — optimized for daily operations.</p>
      </header>

      {err ? (
        <section className="admin-card border border-red-500/25 bg-red-500/[0.08] p-6">
          <p className="text-sm text-red-100/90">{err}</p>
        </section>
      ) : null}
      {trust && !err ? (
        <section className="admin-card border border-white/[0.07] bg-white/[0.02] p-4">
          <h2 className="admin-eyebrow">Trust &amp; reconciliation</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/70">
            <li
              className={cn(
                "rounded-full border px-2.5 py-1",
                trust.reconciliationLabel === "reconciled"
                  ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-100/90"
                  : trust.reconciliationLabel === "variance"
                    ? "border-amber-500/35 bg-amber-500/[0.07] text-amber-50/90"
                    : "border-white/12 bg-black/25 text-white/60",
              )}
            >
              {trust.reconciliationLabel === "reconciled"
                ? "Reconciled today"
                : trust.reconciliationLabel === "variance"
                  ? "Variance today"
                  : "Pending reconciliation"}
            </li>
            {setupProgress ? (
              <li
                className={cn(
                  "rounded-full border px-2.5 py-1",
                  setupProgress.needsSetupCount > 0
                    ? "border-amber-500/35 bg-amber-500/[0.07] text-amber-50/90"
                    : "border-white/10 bg-black/20",
                )}
              >
                Catalog setup:{" "}
                <span className="text-white/85">
                  {setupProgress.needsSetupCount} need setup
                </span>
                <span className="text-white/45">
                  {" "}
                  · {setupProgress.totalProducts} products
                  {setupProgress.assetCount > 0 ? ` · ${setupProgress.assetCount} assets` : ""}
                </span>
              </li>
            ) : null}
            <li className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
              Low stock SKUs: <span className="text-white/85">{trust.lowStockCount}</span>
            </li>
            <li
              className={cn(
                "rounded-full border px-2.5 py-1",
                trust.negativeMarginSkuCount > 0
                  ? "border-red-500/35 bg-red-500/[0.06] text-red-50/90"
                  : "border-white/10 bg-black/20",
              )}
            >
              Below-cost retail: <span className="text-white/85">{trust.negativeMarginSkuCount}</span>
            </li>
            {trust.tightMarginSkuCount > 0 ? (
              <li className="rounded-full border border-amber-500/25 bg-amber-500/[0.05] px-2.5 py-1 text-amber-50/85">
                Tight margin (&lt;{trust.marginWarningPct.toFixed(0)}%): {trust.tightMarginSkuCount}
              </li>
            ) : null}
            <li className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-white/60">
              Inventory updated:{" "}
              {trust.inventoryValuationUpdatedAt
                ? new Date(trust.inventoryValuationUpdatedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                : "—"}
            </li>
            <li className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-white/60">
              Last stock activity:{" "}
              {trust.lastInventoryMovementAt
                ? new Date(trust.lastInventoryMovementAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                : "—"}
            </li>
            <li className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-white/60">
              Last restock (purchase):{" "}
              {trust.lastRestockMovementAt
                ? new Date(trust.lastRestockMovementAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
                : "—"}
            </li>
          </ul>
        </section>
      ) : null}

      {err ? null : rollup && today ? (
        <>
          {(rollup.lowStockCount > 0 || rollup.outOfStockCount > 0) && lowStock.length > 0 ? (
            <section className="admin-card border-amber-500/25 bg-amber-500/[0.06] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-100/80">Stock alerts</h2>
                <Link href="/admin/inventory?status=low_stock" className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]">
                  View all →
                </Link>
              </div>
              <ul className="mt-3 space-y-2">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/admin/inventory/${item.id}`} className="text-white hover:text-[var(--admin-accent)]">
                      {item.product_name}
                    </Link>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                        item.stock_status === "out_of_stock"
                          ? "bg-red-500/20 text-red-100"
                          : "bg-amber-500/20 text-amber-100",
                      )}
                    >
                      {item.quantity_on_hand} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="admin-card p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="admin-stat-label">Inventory value</p>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--admin-accent-soft)] text-[var(--admin-pink)]">
                  <Boxes className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <span className="admin-stat-value">{formatSalonMoney(rollup.inventoryValueUsdCents, "USD")}</span>
            </div>
            <div className="admin-card p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="admin-stat-label">Low stock</p>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/12 text-amber-300">
                  <AlertTriangle className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <span className="admin-stat-value">{rollup.lowStockCount}</span>
            </div>
            <div className="admin-card p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="admin-stat-label">Out of stock</p>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/12 text-red-300">
                  <XCircle className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <span className="admin-stat-value">{rollup.outOfStockCount}</span>
            </div>
            <div className="admin-card p-6">
              <div className="flex items-start justify-between gap-3">
                <p className="admin-stat-label">Gross profit (30d)</p>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--admin-accent-soft)] text-[var(--admin-gold)]">
                  <TrendingUp className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <span className="admin-stat-value text-[var(--admin-accent)]">{formatSalonMoney(grossProfit30d, "USD")}</span>
            </div>
          </div>

          {chartPayload ? <AdminDashboardCharts data={chartPayload} /> : null}

          {saleLogAnalytics ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="admin-card p-6">
                <p className="admin-stat-label">Weekly rental income</p>
                <span className="admin-stat-value">{formatSalonMoney(saleLogAnalytics.weekRentalUsdCents, "USD")}</span>
                <p className="admin-stat-hint">Space lease — operating revenue</p>
              </div>
              <div className="admin-card p-6">
                <p className="admin-stat-label">Month rental income</p>
                <span className="admin-stat-value">{formatSalonMoney(saleLogAnalytics.monthRentalUsdCents, "USD")}</span>
                <Link href="/admin/sales-log" className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]">
                  Sale log →
                </Link>
              </div>
            </div>
          ) : null}

          <section className="admin-card p-6">
            <h2 className="admin-eyebrow">Today&apos;s revenue</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-white/45">Retail (USD equiv.)</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{formatSalonMoney(today.retailUsdCents, "USD")}</p>
                {today.retailNative.USD > 0 || today.retailNative.LRD > 0 ? (
                  <p className="mt-1 text-[11px] text-white/40">
                    {today.retailNative.USD > 0 ? formatSalonMoney(today.retailNative.USD, "USD") : null}
                    {today.retailNative.USD > 0 && today.retailNative.LRD > 0 ? " · " : null}
                    {today.retailNative.LRD > 0 ? formatSalonMoney(today.retailNative.LRD, "LRD") : null}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-white/45">Services (USD equiv.)</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{formatSalonMoney(today.serviceUsdCents, "USD")}</p>
                {today.serviceNative.USD > 0 || today.serviceNative.LRD > 0 ? (
                  <p className="mt-1 text-[11px] text-white/40">
                    {today.serviceNative.USD > 0 ? formatSalonMoney(today.serviceNative.USD, "USD") : null}
                    {today.serviceNative.USD > 0 && today.serviceNative.LRD > 0 ? " · " : null}
                    {today.serviceNative.LRD > 0 ? formatSalonMoney(today.serviceNative.LRD, "LRD") : null}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-white/45">Month (USD equiv.)</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{formatSalonMoney(monthCombined, "USD")}</p>
              </div>
              <div>
                <p className="text-xs text-white/45">YTD (USD equiv.)</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{formatSalonMoney(ytdCombined, "USD")}</p>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="admin-card p-6">
              <h2 className="admin-eyebrow">Best-selling products (YTD)</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {topProducts.length === 0 ? <li className="text-white/40">No retail sales yet.</li> : null}
                {topProducts.map((p) => (
                  <li key={p.name} className="flex justify-between gap-2 border-b border-white/[0.06] py-2 text-white/75">
                    <span>{p.name}</span>
                    <span className="text-white/55">
                      {p.qty} sold · {formatSalonMoney(p.revenueUsdCents, "USD")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="admin-card p-6">
              <h2 className="admin-eyebrow">Top services (YTD)</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {topServices.length === 0 ? <li className="text-white/40">No service entries yet.</li> : null}
                {topServices.map((s) => (
                  <li key={s.name} className="flex justify-between gap-2 border-b border-white/[0.06] py-2 text-white/75">
                    <span>{s.name}</span>
                    <span className="text-white/55">
                      {s.count} · {formatSalonMoney(s.revenueUsdCents, "USD")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="admin-card p-6">
            <h2 className="admin-eyebrow">Top gross margin (inventory)</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {margins.length === 0 ? <li className="text-white/40">Set USD sell prices on inventory to see margins.</li> : null}
              {margins.map((m) => (
                <li key={m.id} className="flex justify-between gap-2 border-b border-white/[0.06] py-2 text-white/75">
                  <Link href={`/admin/inventory/${m.id}`} className="hover:text-[var(--admin-accent)]">
                    {m.name}
                  </Link>
                  <span className="text-[var(--admin-accent)]">{m.marginPct.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="admin-card p-6">
            <h2 className="admin-eyebrow">Recent activity</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {activity.length === 0 ? <li className="text-white/40">No entries in the last two weeks.</li> : null}
              {activity.map((a, i) => (
                <li key={i} className="flex justify-between gap-2 border-b border-white/[0.06] py-2 text-white/75">
                  <span>
                    <span className="text-[10px] uppercase text-white/35">{a.kind}</span> · {a.label}
                  </span>
                  <span className="text-white/55">{formatSalonMoney(a.amountUsdCents, "USD")}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap gap-2 pb-4">
            <Link
              href="/admin/sales/new"
              className="admin-btn-primary inline-flex min-h-[2.75rem] items-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            >
              Sale
            </Link>
            <Link
              href="/admin/services/new"
              className="admin-btn-secondary inline-flex min-h-[2.75rem] items-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            >
              Service
            </Link>
            <Link
              href="/admin/sales-log"
              className="admin-btn-secondary inline-flex min-h-[2.75rem] items-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            >
              Sale log
            </Link>
            {!staff ? (
              <Link
                href="/admin/purchases/new"
                className="admin-btn-secondary inline-flex min-h-[2.75rem] items-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em]"
              >
                Restock
              </Link>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
