import type { Metadata } from "next";
import { SalonInventoryNewForm } from "@/components/admin/salon-inventory-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchSuppliers } from "@/lib/admin/salon-queries";
import { isSalonStaffRole, requireAdminContext } from "@/lib/auth/admin-context";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "New product" };
export const dynamic = "force-dynamic";

export default async function AdminInventoryNewPage() {
  const ctx = await requireAdminContext();
  if (isSalonStaffRole(ctx.roleSlug)) redirect("/admin/inventory");

  const supabase = await createSupabaseServerClient();
  const suppliers = await fetchSuppliers(supabase);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin/inventory" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Inventory
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">New product</h1>
      <SalonInventoryNewForm supplierOptions={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
