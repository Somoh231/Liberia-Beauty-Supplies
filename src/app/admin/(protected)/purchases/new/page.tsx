import type { Metadata } from "next";
import Link from "next/link";
import { SalonPurchaseForm } from "@/components/admin/salon-purchase-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllSuppliersAdmin, fetchInventoryItems } from "@/lib/admin/salon-queries";
import { isSalonStaffRole, requireAdminContext } from "@/lib/auth/admin-context";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "New purchase" };
export const dynamic = "force-dynamic";

export default async function AdminPurchasesNewPage() {
  const ctx = await requireAdminContext();
  if (isSalonStaffRole(ctx.roleSlug)) redirect("/admin/inventory");

  const supabase = await createSupabaseServerClient();
  const [suppliers, items] = await Promise.all([fetchAllSuppliersAdmin(supabase), fetchInventoryItems(supabase)]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin/purchases" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Purchases
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">New purchase</h1>
        <p className="mt-1 text-sm text-white/50">Bulk order from supplier. Received purchases increase stock and update average cost.</p>
      </div>
      {suppliers.length === 0 ? (
        <p className="text-sm text-amber-200/90">Add a supplier first under Suppliers.</p>
      ) : (
        <SalonPurchaseForm
          suppliers={suppliers.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
          items={items.filter((i) => i.active)}
        />
      )}
    </div>
  );
}
