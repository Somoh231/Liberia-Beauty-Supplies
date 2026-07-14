import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchInventoryProductsPage,
  fetchSuppliers,
} from "@/lib/admin/salon-queries";
import {
  displayMoneyOrNotSet,
  inventoryCategoryFromSlug,
  inventoryCategoryToSlug,
} from "@/lib/admin/inventory-categories";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import { inventoryNeedsSetup } from "@/lib/admin/pricing-engine";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ q?: string; page?: string; focus?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = inventoryCategoryFromSlug(categorySlug);
  if (!category) return { title: "Not found · Inventory" };
  return { title: `${category} · Inventory` };
}

export default async function AdminInventoryCategoryPage({ params, searchParams }: Props) {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);
  const { categorySlug } = await params;
  const category = inventoryCategoryFromSlug(categorySlug);
  if (!category) notFound();

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const focusRaw = typeof sp.focus === "string" ? sp.focus : "all";
  const focusFilter: "needs_setup" | "asset" | "ready_retail" | "all" =
    focusRaw === "needs_setup" || focusRaw === "asset" || focusRaw === "ready_retail" ? focusRaw : "all";

  const supabase = await createSupabaseServerClient();
  const [{ rows: items, total, page: curPage, pageSize }, suppliers] = await Promise.all([
    fetchInventoryProductsPage(supabase, {
      q,
      category,
      focus: focusFilter,
      page,
      pageSize: 40,
    }),
    fetchSuppliers(supabase),
  ]);

  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const slug = inventoryCategoryToSlug(category);

  const focusHref = (focus: typeof focusFilter) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (focus !== "all") params.set("focus", focus);
    const qs = params.toString();
    return qs ? `/admin/inventory/categories/${slug}?${qs}` : `/admin/inventory/categories/${slug}`;
  };

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (focusFilter !== "all") params.set("focus", focusFilter);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/inventory/categories/${slug}?${qs}` : `/admin/inventory/categories/${slug}`;
  };

  return (
    <div className="space-y-6 pb-4">
      <div>
        <Link
          href="/admin/inventory"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]"
        >
          ← All categories
        </Link>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">
          {category}
        </h1>
        <p className="mt-1 text-sm text-white/50">
          {total} product{total === 1 ? "" : "s"} · enter operational figures on each item (costs and prices start unset).
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          action={`/admin/inventory/categories/${slug}`}
          method="get"
          className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center"
        >
          {focusFilter !== "all" ? <input type="hidden" name="focus" value={focusFilter} /> : null}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search in category…"
            className="w-full rounded-full border border-white/12 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30"
          />
          <button type="submit" className="admin-btn-secondary rounded-full px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
            Search
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All"],
              ["needs_setup", "Needs setup"],
              ["ready_retail", "Ready"],
              ["asset", "Assets"],
            ] as const
          ).map(([f, label]) => (
            <Link
              key={f}
              href={focusHref(f)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 transition",
                focusFilter === f
                  ? "bg-white/10 text-white ring-white/20"
                  : "text-white/50 ring-transparent hover:bg-white/[0.06] hover:text-white/80",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="admin-card admin-x-scroll overflow-x-auto">
        <table className="admin-data-table min-w-[960px]">
          <thead>
            <tr>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3">Setup</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Supplier</th>
              <th className="px-3 py-3">Cost</th>
              <th className="px-3 py-3">Selling price</th>
              <th className="px-3 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const needsSetup = inventoryNeedsSetup(row) || row.setup_status === "needs_setup";
              const isAsset = row.item_type === "asset";
              const costCents =
                row.weighted_avg_landed_usd_cents && row.weighted_avg_landed_usd_cents > 0
                  ? row.weighted_avg_landed_usd_cents
                  : row.avg_unit_cost_cents;
              const sellCents =
                row.sell_price_usd_cents ?? row.store_price_usd_cents ?? row.sell_price_lrd_cents;
              const sellFormat = (c: number) =>
                row.sell_price_lrd_cents != null && row.sell_price_usd_cents == null && row.store_price_usd_cents == null
                  ? formatSalonMoney(c, "LRD")
                  : formatSalonMoney(c, "USD");
              return (
                <tr key={row.id} className="border-b border-white/[0.06]">
                  <td className="px-3 py-3 text-white">
                    <span className="font-medium">{row.product_name}</span>
                    <span className="ml-2 font-mono text-[10px] text-white/35">{row.product_code}</span>
                  </td>
                  <td className="px-3 py-3">
                    {needsSetup ? (
                      <span className="admin-badge uppercase tracking-wide text-amber-100/90 ring-1 ring-amber-400/35">
                        Needs setup
                      </span>
                    ) : (
                      <span className="admin-badge admin-badge-active uppercase tracking-wide">Ready</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {isAsset ? (
                      <span className="admin-badge uppercase tracking-wide text-sky-100/90 ring-1 ring-sky-400/35">
                        Asset
                      </span>
                    ) : (
                      <span className="admin-badge uppercase tracking-wide text-white/60">Retail</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-white/85">
                    {row.quantity_on_hand} <span className="text-white/40">{row.unit}</span>
                  </td>
                  <td className="px-3 py-3 text-white/75">
                    {row.supplier_id ? supplierName.get(row.supplier_id) ?? "—" : "Not set"}
                  </td>
                  <td className="px-3 py-3 text-white/75">
                    {displayMoneyOrNotSet(costCents, (c) => formatSalonMoney(c, row.cost_currency === "NGN" ? "NGN" : "USD"), {
                      needsSetup,
                      treatZeroAsUnset: true,
                    })}
                  </td>
                  <td className="px-3 py-3 text-white/75">
                    {displayMoneyOrNotSet(sellCents, sellFormat, { needsSetup: true, treatZeroAsUnset: true })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/admin/inventory/${row.id}`}
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                    >
                      {staff ? "View" : needsSetup ? "Set up" : "Edit"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 ? (
          <div className="admin-empty">
            <p className="admin-empty-title">No products in this category</p>
            <p className="admin-empty-text">Import the workbook catalog, or clear filters above.</p>
          </div>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">
          {curPage > 1 ? (
            <Link href={pageHref(curPage - 1)} className="rounded-full border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/[0.06]">
              Previous
            </Link>
          ) : null}
          <span>
            Page {curPage} / {totalPages}
          </span>
          {curPage < totalPages ? (
            <Link href={pageHref(curPage + 1)} className="rounded-full border border-white/15 px-3 py-1.5 text-white/80 hover:bg-white/[0.06]">
              Next
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
