import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryProductsPage, fetchInventoryStatusSummary, fetchLastMovementByItemIds, fetchOperationalSettings } from "@/lib/admin/salon-queries";
import { formatSalonMoney, type StockStatus } from "@/lib/admin/salon-format";
import { effectiveUnitCostUsdCents, resolveOperationalFxFromSettings, unitGrossMarginPct, unitGrossProfitUsdCents } from "@/lib/admin/pricing-engine";
import { cn } from "@/lib/utils";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string; page?: string };

function statusBadge(status: StockStatus | null) {
  const label =
    status === "in_stock" ? "In stock" : status === "low_stock" ? "Low stock" : status === "out_of_stock" ? "Out of stock" : "—";
  const cls =
    status === "in_stock"
      ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
      : status === "low_stock"
        ? "bg-amber-500/15 text-amber-100 ring-amber-500/35"
        : status === "out_of_stock"
          ? "bg-red-500/15 text-red-100 ring-red-500/35"
          : "bg-white/5 text-white/50 ring-white/10";
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1", cls)}>
      {label}
    </span>
  );
}

function marginEconomyHint(m: number | null): { label: string; cls: string } | null {
  if (m == null || !Number.isFinite(m)) return null;
  if (m < 0) return { label: "Sub cost", cls: "border-red-500/35 text-red-100/90 bg-red-500/[0.08]" };
  if (m < 12) return { label: "Tight", cls: "border-amber-500/30 text-amber-100/85 bg-amber-500/[0.07]" };
  if (m >= 35) return { label: "Solid", cls: "border-emerald-500/30 text-emerald-100/90 bg-emerald-500/[0.08]" };
  return null;
}

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireAdminContext();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const st = sp.status;
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const statusFilter: StockStatus | "all" =
    st === "in_stock" || st === "low_stock" || st === "out_of_stock" ? st : "all";

  const supabase = await createSupabaseServerClient();
  const [{ rows: items, total, page: curPage, pageSize }, summary, settings] = await Promise.all([
    fetchInventoryProductsPage(supabase, { q, status: statusFilter, page, pageSize: 15 }),
    fetchInventoryStatusSummary(supabase),
    fetchOperationalSettings(supabase),
  ]);
  const lastById = await fetchLastMovementByItemIds(
    supabase,
    items.map((i) => i.id),
  );

  const staff = isSalonStaffRole(ctx.roleSlug);
  const canImport = ctx.isManagerOrAbove;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const opFx = resolveOperationalFxFromSettings(settings);
  const defaultNgnPerUsd = opFx.ngnPerUsd;

  const filterLink = (status: StockStatus | "all", label: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status !== "all") params.set("status", status);
    const qs = params.toString();
    const active = statusFilter === status;
    return (
      <Link
        href={qs ? `/admin/inventory?${qs}` : "/admin/inventory"}
        className={cn(
          "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 transition",
          active
            ? "bg-white/10 text-white ring-white/20"
            : "text-white/50 ring-transparent hover:bg-white/[0.06] hover:text-white/80",
        )}
      >
        {label}
      </Link>
    );
  };

  const pageLink = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/inventory?${qs}` : "/admin/inventory";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Inventory</h1>
          <p className="mt-1 text-sm text-white/50">
            Supplier → FX → landed (WAC) → wholesale → retail → margin. Same FX as purchases, sales, and dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!staff ? (
            <Link
              href="/admin/inventory/new"
              className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full bg-[var(--admin-accent)] px-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black sm:min-h-0"
            >
              Add product
            </Link>
          ) : null}
          {!staff ? (
            <Link
              href="/admin/purchases/new"
              className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full border border-white/18 px-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85 sm:min-h-0"
            >
              Supplier restock
            </Link>
          ) : null}
          {canImport ? (
            <Link
              href="/admin/inventory/import"
              className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full border border-violet-500/35 bg-violet-500/[0.08] px-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100/90 sm:min-h-0"
            >
              Import preview
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="admin-card border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">In stock</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">{summary.in_stock}</p>
        </div>
        <div className="admin-card border-amber-500/25 bg-amber-500/[0.05] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Low stock</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">{summary.low_stock}</p>
        </div>
        <div className="admin-card border-red-500/25 bg-red-500/[0.05] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-100/70">Out of stock</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">{summary.out_of_stock}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/admin/inventory" method="get" className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
          {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search…"
            className="w-full rounded-full border border-white/12 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30"
          />
          <button
            type="submit"
            className="rounded-full border border-white/18 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85"
          >
            Search
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          {filterLink("all", "All")}
          {filterLink("in_stock", "In stock")}
          {filterLink("low_stock", "Low")}
          {filterLink("out_of_stock", "Out")}
        </div>
      </div>

      <div className="admin-card admin-x-scroll overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Supplier</th>
              <th className="px-3 py-3">FX ₦/$</th>
              <th className="px-3 py-3">Landed (WAC) $</th>
              <th className="px-3 py-3">Wholesale $</th>
              <th className="px-3 py-3">Retail $</th>
              <th className="px-3 py-3">Retail LD</th>
              <th className="px-3 py-3">GP / unit $</th>
              <th className="px-3 py-3">Margin</th>
              <th className="px-3 py-3 hidden lg:table-cell">Last movement</th>
              <th className="px-3 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const usdUnit = effectiveUnitCostUsdCents(row);
              const gross = unitGrossProfitUsdCents(row);
              const margin = unitGrossMarginPct(row);
              const supplierCell =
                row.cost_currency === "NGN"
                  ? formatSalonMoney(row.avg_unit_cost_cents, "NGN")
                  : formatSalonMoney(row.avg_unit_cost_cents, row.cost_currency);
              const fxCell =
                row.cost_currency === "NGN" ? String(Math.round(row.fx_ngn_per_usd ?? defaultNgnPerUsd)) : "—";
              return (
                <tr key={row.id} className="border-b border-white/[0.06]">
                  <td className="px-3 py-3 text-white">
                    <span className="font-medium">{row.product_name}</span>
                    {row.stock_status === "low_stock" ? (
                      <span className="ml-1.5 inline-flex rounded-full border border-amber-500/35 bg-amber-500/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-100/85">
                        Low
                      </span>
                    ) : null}
                    {row.stock_status === "out_of_stock" ? (
                      <span className="ml-1.5 inline-flex rounded-full border border-red-500/30 bg-red-500/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-100/85">
                        Out
                      </span>
                    ) : null}
                    <span className="ml-2 font-mono text-[10px] text-white/35">{row.product_code}</span>
                    {!row.active ? <span className="ml-2 text-[10px] uppercase text-white/35">inactive</span> : null}
                  </td>
                  <td className="px-3 py-3">{statusBadge(row.stock_status)}</td>
                  <td className="px-3 py-3 text-white/85">
                    {row.quantity_on_hand} <span className="text-white/40">{row.unit}</span>
                  </td>
                  <td className="px-3 py-3 text-white/75">{supplierCell}</td>
                  <td className="px-3 py-3 text-white/75">{fxCell}</td>
                  <td className="px-3 py-3 text-white/75">{formatSalonMoney(usdUnit, "USD")}</td>
                  <td className="px-3 py-3 text-white/75">
                    {row.store_price_usd_cents != null ? formatSalonMoney(row.store_price_usd_cents, "USD") : "—"}
                  </td>
                  <td className="px-3 py-3 text-white/75">
                    {row.sell_price_usd_cents != null ? formatSalonMoney(row.sell_price_usd_cents, "USD") : "—"}
                  </td>
                  <td className="px-3 py-3 text-white/75">
                    {row.sell_price_lrd_cents != null ? formatSalonMoney(row.sell_price_lrd_cents, "LRD") : "—"}
                  </td>
                  <td className="px-3 py-3 text-white/75">{gross != null ? formatSalonMoney(gross, "USD") : "—"}</td>
                  <td className="px-3 py-3 text-white/75">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{margin != null ? `${margin.toFixed(1)}%` : "—"}</span>
                      {(() => {
                        const hint = marginEconomyHint(margin);
                        return hint ? (
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                              hint.cls,
                            )}
                          >
                            {hint.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-white/75 hidden lg:table-cell">
                    {(() => {
                      const lm = lastById[row.id];
                      if (!lm) return <span className="text-white/35">—</span>;
                      const ch = lm.quantity_change;
                      const sign = ch > 0 ? "+" : "";
                      return (
                        <span className="text-[11px] text-white/60" title={new Date(lm.created_at).toLocaleString()}>
                          <span className="text-white/75">{lm.movement_type.replace(/_/g, " ")}</span> · {sign}
                          {ch}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/inventory/${row.id}`}
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                    >
                      {staff ? "View" : "Edit"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 ? <p className="p-6 text-sm text-white/45">No products match this view.</p> : null}
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
          {curPage > 1 ? (
            <Link href={pageLink(curPage - 1)} className="rounded-full border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/[0.06]">
              Previous
            </Link>
          ) : null}
          <span>
            Page {curPage} / {totalPages}
          </span>
          {curPage < totalPages ? (
            <Link href={pageLink(curPage + 1)} className="rounded-full border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/[0.06]">
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
