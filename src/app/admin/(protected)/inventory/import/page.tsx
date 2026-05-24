import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InventoryImportPreviewPanel } from "@/components/admin/inventory-import-preview";
import { requireAdminContext } from "@/lib/auth/admin-context";

export const metadata: Metadata = { title: "Import inventory" };
export const dynamic = "force-dynamic";

export default async function AdminInventoryImportPage() {
  const ctx = await requireAdminContext();
  if (!ctx.isManagerOrAbove) redirect("/admin/inventory");

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <Link href="/admin/inventory" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Inventory
      </Link>
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Inventory import</h1>
        <p className="max-w-3xl text-sm text-white/50">
          Safe migration — parse the master workbook, validate every row, then commit validated rows. Unresolved rows
          are deferred to the import batch for later review without blocking rollout. Staff cannot access this
          workflow.
        </p>
      </header>
      <InventoryImportPreviewPanel />
    </div>
  );
}
