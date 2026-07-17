import type { Metadata } from "next";
import Link from "next/link";
import { NewWeeklySalesReportForm } from "@/components/admin/weekly-sales-log-new-form";
import { SalesLogFilterBar } from "@/components/admin/sales-log-filter-bar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchWeeklyReports,
  fetchRetailSalesRecent,
  fetchServiceLogsRecent,
  fetchSpaceLeasePayments,
  fetchAllRetailSalesForTotals,
  fetchAllServiceLogsForTotals,
  fetchAllSpaceLeasePaymentsForTotals,
} from "@/lib/admin/salon-queries";
import { RecentRetailSalesPanel } from "@/components/admin/recent-retail-sales-panel";
import { RecentServiceLogsPanel } from "@/components/admin/recent-service-logs-panel";
import { SpaceLeasePanel } from "@/components/admin/space-lease-panel";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";
import {
  buildSalesLogHref,
  parseSalesLogSearchParams,
  salesLogRangeLabel,
  SALES_LOG_BUSINESS_TIMEZONE,
} from "@/lib/admin/sales-log-filters";
import {
  filteredSalesLogHasRows,
  summarizeFilteredSalesLog,
} from "@/lib/admin/sales-log-filtered-totals";

export const metadata: Metadata = { title: "Sale Log" };
export const dynamic = "force-dynamic";

const DISPLAY_RETAIL_LIMIT = 80;
const DISPLAY_SERVICE_LIMIT = 80;
const DISPLAY_LEASE_LIMIT = 80;

type Search = Record<string, string | string[] | undefined>;

export default async function AdminSalesLogIndexPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);
  const supabase = await createSupabaseServerClient();
  const canManage = ctx.isManagerOrAbove;
  const sp = await searchParams;
  const filter = parseSalesLogSearchParams(sp);
  const returnTo = buildSalesLogHref({
    range: filter.range,
    source: filter.source,
    from: filter.from,
    to: filter.to,
  });

  const showRetail = filter.source === "all" || filter.source === "retail";
  const showServices = filter.source === "all" || filter.source === "services";
  const showStylistFees = filter.source === "all" || filter.source === "stylist-fees";

  const emptyAgg = { rows: [], incomplete: false as const };

  const [reports, retailDisplay, serviceDisplay, leaseDisplay, retailAgg, serviceAgg, leaseAgg] =
    await Promise.all([
      fetchWeeklyReports(supabase),
      showRetail ? fetchRetailSalesRecent(supabase, DISPLAY_RETAIL_LIMIT, filter.bounds) : Promise.resolve([]),
      showServices ? fetchServiceLogsRecent(supabase, DISPLAY_SERVICE_LIMIT, filter.bounds) : Promise.resolve([]),
      showStylistFees ? fetchSpaceLeasePayments(supabase, DISPLAY_LEASE_LIMIT, filter.bounds) : Promise.resolve([]),
      showRetail ? fetchAllRetailSalesForTotals(supabase, filter.bounds) : Promise.resolve(emptyAgg),
      showServices ? fetchAllServiceLogsForTotals(supabase, filter.bounds) : Promise.resolve(emptyAgg),
      showStylistFees ? fetchAllSpaceLeasePaymentsForTotals(supabase, filter.bounds) : Promise.resolve(emptyAgg),
    ]);

  const totalsIncomplete = retailAgg.incomplete || serviceAgg.incomplete || leaseAgg.incomplete;
  const totals = summarizeFilteredSalesLog({
    retail: retailAgg.rows,
    services: serviceAgg.rows,
    rentals: leaseAgg.rows,
    source: filter.source,
  });
  const hasRows = filteredSalesLogHasRows(totals, filter.source);
  const rangeLabel = salesLogRangeLabel(filter);

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">
          Sale log
        </h1>
        <p className="max-w-2xl text-sm text-white/50">
          Aggregates authoritative transactions: retail sales, service logs, and stylist fee / rental payments. Dates use{" "}
          {SALES_LOG_BUSINESS_TIMEZONE}. Managers can edit source records; archived weekly worksheets are view-only
          historical files.
        </p>
      </header>

      <SalesLogFilterBar filter={filter} />

      {totalsIncomplete ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-50/90">
          Totals are partial — more matching rows exist than the server safety ceiling. Narrow the date range for exact
          figures.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {showRetail ? (
          <div className="admin-card p-6">
            <p className="admin-stat-label">
              Retail ({rangeLabel})
              {totalsIncomplete ? " · partial" : ""}
            </p>
            <span className="admin-stat-value">{formatSalonMoney(totals.retailUsdCents, "USD")}</span>
            <p className="admin-stat-hint">
              {totals.retailCount} sale{totals.retailCount === 1 ? "" : "s"}
              {totals.retailNative.USD > 0 || totals.retailNative.LRD > 0
                ? ` · ${[
                    totals.retailNative.USD > 0 ? formatSalonMoney(totals.retailNative.USD, "USD") : null,
                    totals.retailNative.LRD > 0 ? formatSalonMoney(totals.retailNative.LRD, "LRD") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}`
                : ""}
            </p>
          </div>
        ) : null}
        {showServices ? (
          <div className="admin-card p-6">
            <p className="admin-stat-label">
              Services ({rangeLabel})
              {totalsIncomplete ? " · partial" : ""}
            </p>
            <span className="admin-stat-value">{formatSalonMoney(totals.serviceUsdCents, "USD")}</span>
            <p className="admin-stat-hint">
              {totals.serviceCount} log{totals.serviceCount === 1 ? "" : "s"}
              {totals.serviceNative.USD > 0 || totals.serviceNative.LRD > 0
                ? ` · ${[
                    totals.serviceNative.USD > 0 ? formatSalonMoney(totals.serviceNative.USD, "USD") : null,
                    totals.serviceNative.LRD > 0 ? formatSalonMoney(totals.serviceNative.LRD, "LRD") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}`
                : ""}
            </p>
          </div>
        ) : null}
        {showStylistFees ? (
          <div className="admin-card p-6">
            <p className="admin-stat-label">
              Stylist fees ({rangeLabel})
              {totalsIncomplete ? " · partial" : ""}
            </p>
            <span className="admin-stat-value">{formatSalonMoney(totals.rentalUsdCents, "USD")}</span>
            <p className="admin-stat-hint">
              {totals.rentalCount} payment{totals.rentalCount === 1 ? "" : "s"} · known USD conversions only
            </p>
            {totals.rentalCoverage.coverageLabel ? (
              <p className="mt-1 text-[10px] text-amber-200/80">{totals.rentalCoverage.coverageLabel}</p>
            ) : null}
          </div>
        ) : null}
        {showRetail ? (
          <div className="admin-card p-6">
            <p className="admin-stat-label">
              Retail gross profit ({rangeLabel})
              {totalsIncomplete ? " · partial" : ""}
            </p>
            <span className="admin-stat-value text-[var(--admin-accent)]">
              {totals.retailGrossProfitUsdCents == null
                ? "Unavailable"
                : formatSalonMoney(totals.retailGrossProfitUsdCents, "USD")}
            </span>
            {totals.retailGrossProfitUsdCents == null ? (
              <p className="admin-stat-hint">Margin unavailable</p>
            ) : totals.retailGrossProfitUsdCents === 0 ? (
              <p className="admin-stat-hint">
                Break-even
                {totals.retailMarginPartial ? " · partial" : ""}
              </p>
            ) : totals.retailMarginPct != null ? (
              <p className="admin-stat-hint">
                Margin {totals.retailMarginPct.toFixed(1)}%
                {totals.retailMarginPartial ? " · partial" : ""}
              </p>
            ) : (
              <p className="admin-stat-hint">Margin unavailable</p>
            )}
            {totals.retailCostCoverageLabel ? (
              <p className="mt-1 text-[10px] text-white/40">{totals.retailCostCoverageLabel}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {!hasRows ? (
        <section className="admin-card border border-amber-500/20 bg-amber-500/[0.05] p-6">
          <h2 className="text-sm font-semibold text-white">No records match these filters</h2>
          <p className="mt-2 max-w-xl text-sm text-white/55">
            The Sales Log still has data outside this view. Adjust the date range or source, or clear filters to return
            to this month.
          </p>
          <Link
            href={buildSalesLogHref({ range: "month", source: "all" })}
            className="mt-4 inline-flex text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
          >
            Clear filters
          </Link>
        </section>
      ) : null}

      {showStylistFees ? (
        <SpaceLeasePanel
          rows={leaseDisplay}
          canManage={canManage}
          weekRentalUsdCents={totals.rentalUsdCents}
          monthRentalUsdCents={totals.rentalUsdCents}
          weekLabel={`Filtered total (USD equiv.)`}
          monthLabel={`Native recorded`}
          weekConversionCoverageLabel={totals.rentalCoverage.coverageLabel}
          monthConversionCoverageLabel={
            totals.rentalNative.USD > 0 || totals.rentalNative.LRD > 0
              ? [
                  totals.rentalNative.USD > 0 ? formatSalonMoney(totals.rentalNative.USD, "USD") : null,
                  totals.rentalNative.LRD > 0 ? formatSalonMoney(totals.rentalNative.LRD, "LRD") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null
          }
          emptyMessage="No stylist fee / rental payments in this filter range."
        />
      ) : null}

      {showRetail ? (
        <RecentRetailSalesPanel
          sales={retailDisplay}
          canEdit={canManage}
          returnTo={returnTo}
          emptyMessage="No retail sales in this filter range."
        />
      ) : null}

      {showServices ? (
        <RecentServiceLogsPanel
          logs={serviceDisplay}
          canEdit={canManage}
          returnTo={returnTo}
          emptyMessage="No service transactions in this filter range."
        />
      ) : null}

      {!staff ? (
        <details className="admin-card group border border-white/[0.06] p-5 opacity-90">
          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 group-open:text-white/70 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-white/50">Archived</span>
              Legacy weekly worksheets
            </span>
          </summary>
          <p className="mt-3 text-xs text-white/40">
            Historical week files only — not authoritative editable transactions. Daily{" "}
            <strong className="text-white/60">Retail</strong>, <strong className="text-white/60">Service</strong>, and{" "}
            <strong className="text-white/60">Rental</strong> rows above are the operational source of truth. Do not edit
            worksheet lines to correct live Sales Log totals.
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
