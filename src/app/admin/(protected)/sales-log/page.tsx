import type { Metadata } from "next";
import Link from "next/link";
import { NewWeeklySalesReportForm } from "@/components/admin/weekly-sales-log-new-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchWeeklyReports,
  fetchSaleLogAnalytics,
  fetchRetailSalesRecent,
  fetchSpaceLeasePayments,
  type CurrencyTotals,
} from "@/lib/admin/salon-queries";
import { RecentRetailSalesPanel } from "@/components/admin/recent-retail-sales-panel";
import { SpaceLeasePanel } from "@/components/admin/space-lease-panel";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";

export const metadata: Metadata = { title: "Sale Log" };
export const dynamic = "force-dynamic";

function nativeLines(retail: CurrencyTotals, service: CurrencyTotals) {
  const parts: string[] = [];
  const rTotal = retail.USD + retail.LRD;
  const sTotal = service.USD + service.LRD;
  if (rTotal > 0) {
    const r: string[] = [];
    if (retail.USD > 0) r.push(`Retail ${formatSalonMoney(retail.USD, "USD")}`);
    if (retail.LRD > 0) r.push(formatSalonMoney(retail.LRD, "LRD"));
    parts.push(r.join(" · "));
  }
  if (sTotal > 0) {
    const s: string[] = [];
    if (service.USD > 0) s.push(`Services ${formatSalonMoney(service.USD, "USD")}`);
    if (service.LRD > 0) s.push(formatSalonMoney(service.LRD, "LRD"));
    parts.push(s.join(" · "));
  }
  return parts.length ? parts.join(" / ") : "—";
}

function PeriodNativeCard({
  title,
  retailUsd,
  serviceUsd,
  retailNative,
  serviceNative,
}: {
  title: string;
  retailUsd: number;
  serviceUsd: number;
  retailNative: CurrencyTotals;
  serviceNative: CurrencyTotals;
}) {
  return (
    <div className="admin-card p-6">
      <p className="admin-stat-label">{title}</p>
      <span className="admin-stat-value">{formatSalonMoney(retailUsd + serviceUsd, "USD")}</span>
      <p className="admin-stat-hint leading-relaxed">{nativeLines(retailNative, serviceNative)}</p>
    </div>
  );
}

export default async function AdminSalesLogIndexPage() {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);
  const supabase = await createSupabaseServerClient();
  const canManage = ctx.isManagerOrAbove;
  const [reports, analytics, recentSales, spaceLeaseRows] = await Promise.all([
    fetchWeeklyReports(supabase),
    fetchSaleLogAnalytics(supabase),
    fetchRetailSalesRecent(supabase, 40),
    fetchSpaceLeasePayments(supabase, 60),
  ]);

  const trend = analytics.dailyUsd.slice(-14);
  const maxBar = Math.max(1, ...trend.map((d) => d.combinedUsdCents));

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">Sale log</h1>
        <p className="max-w-2xl text-sm text-white/50">
          Automatically aggregates daily retail sales from the Sale module and service revenue from the Service module.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PeriodNativeCard
          title="This week (USD equiv.)"
          retailUsd={analytics.weekRetailUsdCents}
          serviceUsd={analytics.weekServiceUsdCents}
          retailNative={analytics.weekNative.retail}
          serviceNative={analytics.weekNative.service}
        />
        <div className="admin-card p-6">
          <p className="admin-stat-label">Week · rental / space</p>
          <span className="admin-stat-value">{formatSalonMoney(analytics.weekRentalUsdCents, "USD")}</span>
          <p className="admin-stat-hint">Operating revenue — not retail gross profit</p>
        </div>
        <PeriodNativeCard
          title="This month (USD equiv.)"
          retailUsd={analytics.monthRetailUsdCents}
          serviceUsd={analytics.monthServiceUsdCents}
          retailNative={analytics.monthNative.retail}
          serviceNative={analytics.monthNative.service}
        />
        <PeriodNativeCard
          title="Year to date (USD equiv.)"
          retailUsd={analytics.ytdRetailUsdCents}
          serviceUsd={analytics.ytdServiceUsdCents}
          retailNative={analytics.ytdNative.retail}
          serviceNative={analytics.ytdNative.service}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="admin-card p-6">
          <p className="admin-stat-label">Week · retail only</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-white">{formatSalonMoney(analytics.weekRetailUsdCents, "USD")}</p>
        </div>
        <div className="admin-card p-6">
          <p className="admin-stat-label">Week · services only</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-white">{formatSalonMoney(analytics.weekServiceUsdCents, "USD")}</p>
        </div>
        <div className="admin-card p-6">
          <p className="admin-stat-label">Month · combined</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-white">
            {formatSalonMoney(analytics.monthRetailUsdCents + analytics.monthServiceUsdCents, "USD")}
          </p>
        </div>
        <div className="admin-card p-6">
          <p className="admin-stat-label">YTD · combined</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-[var(--admin-accent)]">
            {formatSalonMoney(analytics.ytdRetailUsdCents + analytics.ytdServiceUsdCents, "USD")}
          </p>
        </div>
        <div className="admin-card p-6">
          <p className="admin-stat-label">Month · rental / space</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-white">{formatSalonMoney(analytics.monthRentalUsdCents, "USD")}</p>
        </div>
      </div>

      <SpaceLeasePanel
        rows={spaceLeaseRows}
        canManage={canManage}
        weekRentalUsdCents={analytics.weekRentalUsdCents}
        monthRentalUsdCents={analytics.monthRentalUsdCents}
      />

      <RecentRetailSalesPanel sales={recentSales} canEdit={canManage} />

      <section className="admin-card p-6">
        <h2 className="admin-eyebrow">Revenue trend (14 days, USD)</h2>
        <div className="mt-6 flex h-36 items-end gap-1 sm:gap-1.5">
          {trend.length === 0 ? <p className="text-sm text-white/40">No activity yet this year.</p> : null}
          {trend.map((d) => (
            <div key={d.day} className="flex h-36 flex-1 flex-col items-center justify-end gap-1">
              <div
                className="w-full max-w-[14px] rounded-t-md bg-gradient-to-t from-[#7a3e5c]/90 to-[var(--admin-accent)]/85"
                style={{ height: `${Math.max(4, Math.round((d.combinedUsdCents / maxBar) * 120))}px` }}
                title={`${d.day}: ${formatSalonMoney(d.combinedUsdCents, "USD")}`}
              />
              <span className="hidden text-[8px] text-white/35 sm:block">{d.day.slice(5)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="admin-card overflow-x-auto p-6">
          <h2 className="admin-eyebrow">Top products</h2>
          <table className="admin-data-table mt-2">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/40">
                <th className="py-2">Product</th>
                <th className="py-2">Qty</th>
                <th className="py-2 text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topProducts.map((p) => (
                <tr key={p.name} className="border-b border-white/[0.06]">
                  <td className="py-2 text-white">{p.name}</td>
                  <td className="py-2 text-white/60">{p.qty}</td>
                  <td className="py-2 text-right text-white/70">{formatSalonMoney(p.revenueUsdCents, "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="admin-card overflow-x-auto p-6">
          <h2 className="admin-eyebrow">Top services</h2>
          <table className="admin-data-table mt-2">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/40">
                <th className="py-2">Service</th>
                <th className="py-2">Count</th>
                <th className="py-2 text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topServices.map((p) => (
                <tr key={p.name} className="border-b border-white/[0.06]">
                  <td className="py-2 text-white">{p.name}</td>
                  <td className="py-2 text-white/60">{p.count}</td>
                  <td className="py-2 text-right text-white/70">{formatSalonMoney(p.revenueUsdCents, "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="admin-card overflow-x-auto p-6">
        <h2 className="admin-eyebrow">Daily activity (YTD)</h2>
        <div className="mt-3 max-h-72 overflow-y-auto">
          <table className="admin-data-table min-w-[520px]">
            <thead className="sticky top-0 bg-[var(--admin-card)]">
              <tr>
                <th className="py-2">Day</th>
                <th className="py-2 text-right">Retail USD</th>
                <th className="py-2 text-right">Service USD</th>
                <th className="py-2 text-right">Combined</th>
              </tr>
            </thead>
            <tbody>
              {[...analytics.dailyUsd].reverse().map((d) => (
                <tr key={d.day} className="border-b border-white/[0.06]">
                  <td className="py-2 text-white">{d.day}</td>
                  <td className="py-2 text-right text-white/70">{formatSalonMoney(d.retailUsdCents, "USD")}</td>
                  <td className="py-2 text-right text-white/70">{formatSalonMoney(d.serviceUsdCents, "USD")}</td>
                  <td className="py-2 text-right text-[var(--admin-accent)]">{formatSalonMoney(d.combinedUsdCents, "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!staff ? (
        <details className="admin-card group border border-white/[0.06] p-5 opacity-90">
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 group-open:text-white/70 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/50">Archived</span>
              Legacy weekly worksheets
            </span>
          </summary>
          <p className="mt-3 text-xs text-white/40">
            Historical week files only. Daily <strong className="text-white/60">Sale</strong> and{" "}
            <strong className="text-white/60">Service</strong> entries above are the operational source of truth — new
            worksheet lines no longer affect inventory.
          </p>
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-100/80">
            Creating a new worksheet is for record-keeping only. Prefer Sale and Service for all new revenue and stock
            movement.
          </div>
          <div className="mt-4">
            <NewWeeklySalesReportForm />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="admin-data-table min-w-[520px]">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Staff on duty</th>
                  <th>Created</th>
                  <th> </th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-white/[0.06]">
                    <td className="px-4 py-3 text-white">
                      {r.start_date} <span className="text-white/40">→</span> {r.end_date}
                    </td>
                    <td className="px-4 py-3 text-white/70">{r.staff_on_duty ?? "—"}</td>
                    <td className="px-4 py-3 text-white/55">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/sales-log/${r.id}`}
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reports.length === 0 ? <p className="px-1 py-4 text-sm text-white/45">No weekly worksheets on file.</p> : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
