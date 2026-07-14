import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryProducts, fetchInventorySetupProgress } from "@/lib/admin/salon-queries";
import { summarizeInventoryByCategory } from "@/lib/admin/inventory-categories";
import { EXPECTED_CATALOG_CATEGORY_COUNT, EXPECTED_CATALOG_PRODUCT_TOTAL } from "@/lib/admin/inventory-import/types";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

type Search = { imported?: string };

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireAdminContext();
  const sp = await searchParams;
  const showImportedBanner = sp.imported === "1" || sp.imported === "true";

  const supabase = await createSupabaseServerClient();
  const [items, setup] = await Promise.all([
    fetchInventoryProducts(supabase, {}),
    fetchInventorySetupProgress(supabase),
  ]);
  const categories = summarizeInventoryByCategory(items);
  const staff = isSalonStaffRole(ctx.roleSlug);
  const canImport = ctx.isManagerOrAbove;
  const totalLive = items.length;

  return (
    <div className="space-y-8 pb-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">
            Inventory
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/50">
            Workbook categories first. Open a category to set up quantities, suppliers, costs, and retail prices on the
            preloaded catalog.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canImport ? (
            <Link
              href="/admin/inventory/import"
              className="admin-btn-primary inline-flex min-h-[2.75rem] items-center justify-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em] sm:min-h-0"
            >
              Import workbook catalog
            </Link>
          ) : null}
          {!staff ? (
            <Link
              href="/admin/inventory/new"
              className="admin-btn-secondary inline-flex min-h-[2.75rem] items-center justify-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em] sm:min-h-0"
            >
              Add non-catalog product
            </Link>
          ) : null}
          {!staff ? (
            <Link
              href="/admin/purchases/new"
              className="admin-btn-secondary inline-flex min-h-[2.75rem] items-center justify-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em] sm:min-h-0"
            >
              Supplier restock
            </Link>
          ) : null}
        </div>
      </div>

      {showImportedBanner ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/90">
          {EXPECTED_CATALOG_CATEGORY_COUNT} categories and {EXPECTED_CATALOG_PRODUCT_TOTAL} products loaded. Open a
          category to enter operational figures — nothing was auto-priced from the workbook.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="admin-card p-5">
          <p className="admin-stat-label">Live products</p>
          <span className="admin-stat-value">{totalLive}</span>
        </div>
        <div className="admin-card border-amber-500/20 bg-amber-500/[0.04] p-5">
          <p className="admin-stat-label text-amber-100/70">Needs setup</p>
          <span className="admin-stat-value">{setup.needsSetupCount}</span>
        </div>
        <div className="admin-card border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <p className="admin-stat-label text-emerald-200/70">Ready retail</p>
          <span className="admin-stat-value">{setup.readyRetailCount}</span>
        </div>
      </div>

      {totalLive === 0 ? (
        <div className="admin-empty admin-card p-8">
          <p className="admin-empty-title">No catalog loaded yet</p>
          <p className="admin-empty-text">
            Import the approved Final Master Inventory Workbook to preload {EXPECTED_CATALOG_CATEGORY_COUNT} categories
            and {EXPECTED_CATALOG_PRODUCT_TOTAL} product names. Do not recreate those products one by one.
          </p>
          {canImport ? (
            <Link
              href="/admin/inventory/import"
              className="admin-btn-primary mt-4 inline-flex rounded-full px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            >
              Import workbook catalog
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
          {categories.map((cat) => {
            const empty = cat.totalProducts === 0;
            return (
              <Link
                key={cat.slug}
                href={`/admin/inventory/categories/${cat.slug}`}
                className={cn(
                  "admin-card group block p-6 transition hover:border-white/20 hover:bg-white/[0.03]",
                  empty && "opacity-55",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-white group-hover:text-[var(--admin-accent)]">
                    {cat.category}
                  </h2>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                    Open →
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Products</dt>
                    <dd className="mt-1 text-lg font-medium text-white">{cat.totalProducts}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Needs setup</dt>
                    <dd className="mt-1 text-lg font-medium text-amber-100/90">{cat.needsSetupCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Ready</dt>
                    <dd className="mt-1 text-lg font-medium text-emerald-100/85">{cat.readyCount}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-white/40">Assets</dt>
                    <dd className="mt-1 text-lg font-medium text-sky-100/85">{cat.assetCount}</dd>
                  </div>
                </dl>
                {cat.expectedWorkbookCount != null ? (
                  <p className="mt-3 text-[11px] text-white/35">
                    Workbook expects {cat.expectedWorkbookCount}
                    {cat.totalProducts === cat.expectedWorkbookCount ? " · matched" : ""}
                  </p>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      {!staff ? (
        <p className="text-xs text-white/40">
          Need something outside the workbook?{" "}
          <Link href="/admin/inventory/new" className="text-[var(--admin-accent)] underline-offset-2 hover:underline">
            Add a product not already in the catalog
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
