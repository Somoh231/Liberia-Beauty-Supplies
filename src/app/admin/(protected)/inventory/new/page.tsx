import type { Metadata } from "next";
import { SalonInventoryNewForm } from "@/components/admin/salon-inventory-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadInventoryFormBootstrap, toSupplierOptions } from "@/lib/admin/inventory-form-bootstrap";
import { fetchInventoryCategoryNames } from "@/lib/admin/salon-queries";
import { WORKBOOK_CATALOG_CATEGORIES } from "@/lib/admin/inventory-categories";
import { isSalonStaffRole, requireAdminContext } from "@/lib/auth/admin-context";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Add non-catalog product" };
export const dynamic = "force-dynamic";

export default async function AdminInventoryNewPage() {
  const ctx = await requireAdminContext();
  if (isSalonStaffRole(ctx.roleSlug)) redirect("/admin/inventory");

  const supabase = await createSupabaseServerClient();
  const [{ suppliers, fxSummaryLine }, liveCategories] = await Promise.all([
    loadInventoryFormBootstrap(supabase, "page:/admin/inventory/new"),
    fetchInventoryCategoryNames(supabase),
  ]);
  const supplierOptions = toSupplierOptions(suppliers);
  const categoryOptions = [
    ...new Set([...WORKBOOK_CATALOG_CATEGORIES, ...liveCategories]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin/inventory" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Inventory categories
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">
          Add a product not already in the catalog
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/50">
          The workbook catalog is loaded by import — not by this form. Use this only for genuine additions outside the
          approved Final Master Inventory Workbook.
        </p>
      </div>
      <SalonInventoryNewForm
        supplierOptions={supplierOptions}
        categoryOptions={categoryOptions}
        fxSummaryLine={fxSummaryLine}
      />
    </div>
  );
}
