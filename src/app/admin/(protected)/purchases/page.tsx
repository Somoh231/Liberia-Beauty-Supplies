import type { Metadata } from "next";
import Link from "next/link";
import { SalonReceivePurchaseButton } from "@/components/admin/salon-receive-purchase-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllSuppliersAdmin, fetchPurchases } from "@/lib/admin/salon-queries";
import { isSalonStaffRole, requireAdminContext } from "@/lib/auth/admin-context";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Purchases" };
export const dynamic = "force-dynamic";

export default async function AdminPurchasesPage() {
  const ctx = await requireAdminContext();
  if (isSalonStaffRole(ctx.roleSlug)) redirect("/admin/inventory");

  const supabase = await createSupabaseServerClient();
  const [purchases, suppliers] = await Promise.all([fetchPurchases(supabase, 60), fetchAllSuppliersAdmin(supabase)]);
  const supplierName = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Purchases</h1>
          <p className="mt-1 text-sm text-white/50">Nigeria → Liberia shipments. Mark received to add stock.</p>
        </div>
        <Link
          href="/admin/purchases/new"
          className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full bg-[var(--admin-accent)] px-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black sm:min-h-0"
        >
          New purchase
        </Link>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-b border-white/[0.06]">
                <td className="px-4 py-3 text-white/80">{p.purchase_date}</td>
                <td className="px-4 py-3 text-white">{supplierName[p.supplier_id] ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={p.status === "received" ? "text-emerald-300/90" : "text-amber-200/90"}>{p.status}</span>
                </td>
                <td className="px-4 py-3 text-white/60">{p.currency}</td>
                <td className="px-4 py-3 text-right">
                  {p.status === "draft" ? <SalonReceivePurchaseButton purchaseId={p.id} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length === 0 ? <p className="p-6 text-sm text-white/45">No purchases yet.</p> : null}
      </div>
    </div>
  );
}
