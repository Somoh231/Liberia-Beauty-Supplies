import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryProducts, fetchInventoryStatusSummary, fetchSuppliers } from "@/lib/admin/salon-queries";
import { formatSalonMoney, type StockStatus } from "@/lib/admin/salon-format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string };

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

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const st = sp.status;
  const statusFilter: StockStatus | "all" =
    st === "in_stock" || st === "low_stock" || st === "out_of_stock" ? st : "all";

  const supabase = await createSupabaseServerClient();
  const [items, summary, suppliers] = await Promise.all([
    fetchInventoryProducts(supabase, { q, status: statusFilter }),
    fetchInventoryStatusSummary(supabase),
    fetchSuppliers(supabase),
  ]);

  const supMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

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

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Inventory</h1>
          <p className="mt-1 text-sm text-white/50">Search by product code or name. Stock status updates from quantity and low-stock threshold.</p>
        </div>
        <Link
          href="/admin/inventory/new"
          className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full bg-[var(--admin-accent)] px-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black sm:min-h-0"
        >
          Add product
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="admin-card border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/70">Total in stock</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">{summary.in_stock}</p>
          <p className="mt-1 text-xs text-white/45">SKUs above low threshold</p>
        </div>
        <div className="admin-card border-amber-500/25 bg-amber-500/[0.05] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/70">Total low stock</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">{summary.low_stock}</p>
          <p className="mt-1 text-xs text-white/45">1–threshold qty</p>
        </div>
        <div className="admin-card border-red-500/25 bg-red-500/[0.05] p-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-100/70">Total out of stock</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-3xl text-white">{summary.out_of_stock}</p>
          <p className="mt-1 text-xs text-white/45">Zero on hand</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form action="/admin/inventory" method="get" className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
          {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search code or name…"
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

      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">
              <th className="px-3 py-3">Code</th>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Unit cost</th>
              <th className="px-3 py-3">Stock value</th>
              <th className="px-3 py-3">Sell price</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Supplier</th>
              <th className="px-3 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const val =
                row.total_stock_value_minor != null
                  ? row.total_stock_value_minor
                  : Math.round(Number(row.quantity_on_hand) * row.avg_unit_cost_cents);
              return (
                <tr key={row.id} className="border-b border-white/[0.06]">
                  <td className="px-3 py-3 font-mono text-xs text-white/90">{row.product_code}</td>
                  <td className="px-3 py-3 text-white">
                    <span className="font-medium">{row.product_name}</span>
                    {row.sku ? <span className="ml-2 text-xs text-white/35">{row.sku}</span> : null}
                    {!row.active ? <span className="ml-2 text-[10px] uppercase text-white/35">inactive</span> : null}
                  </td>
                  <td className="px-3 py-3">{statusBadge(row.stock_status)}</td>
                  <td className="px-3 py-3 text-white/85">
                    {row.quantity_on_hand} <span className="text-white/40">{row.unit}</span>
                  </td>
                  <td className="px-3 py-3 text-white/75">{formatSalonMoney(row.avg_unit_cost_cents, row.cost_currency)}</td>
                  <td className="px-3 py-3 text-white/75">{formatSalonMoney(val, row.cost_currency)}</td>
                  <td className="px-3 py-3 text-white/55">
                    {row.default_unit_price_cents != null
                      ? formatSalonMoney(row.default_unit_price_cents, row.default_price_currency)
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-white/55">{row.category ?? "—"}</td>
                  <td className="px-3 py-3 text-white/55">{row.supplier_id ? (supMap[row.supplier_id] ?? "—") : "—"}</td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/inventory/${row.id}`}
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 ? <p className="p-6 text-sm text-white/45">No products match this view.</p> : null}
      </div>
    </div>
  );
}
