import type { Metadata } from "next";
import Link from "next/link";
import { SalonReceivePurchaseButton } from "@/components/admin/salon-receive-purchase-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchPurchases } from "@/lib/admin/salon-queries";
import { loadSuppliersAdminPage } from "@/lib/admin/inventory-form-bootstrap";
import { isSalonStaffRole, requireAdminContext } from "@/lib/auth/admin-context";
import { redirect } from "next/navigation";
export const metadata: Metadata = { title: "Purchases" };
export const dynamic = "force-dynamic";

export default async function AdminPurchasesPage() {
  const ctx = await requireAdminContext();
  if (isSalonStaffRole(ctx.roleSlug)) redirect("/admin/inventory");

  const supabase = await createSupabaseServerClient();
  const [purchases, { rows: suppliers }] = await Promise.all([
    fetchPurchases(supabase, 60).catch(() => [] as Awaited<ReturnType<typeof fetchPurchases>>),
    loadSuppliersAdminPage(supabase),
  ]);
  const supplierName = Object.fromEntries((suppliers ?? []).filter((s) => s?.id).map((s) => [s.id, s.name ?? "—"]));

  return (
    <div className="space-y-8 pb-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">Purchases</h1>
          <p className="mt-1 text-sm text-white/50">Nigeria → Liberia shipments. Mark received to add stock.</p>
        </div>
        <Link
          href="/admin/purchases/new"
          className="admin-btn-primary inline-flex min-h-[2.75rem] items-center justify-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em] sm:min-h-0"
        >
          New purchase
        </Link>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-data-table min-w-[560px]">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Currency</th>
              <th> </th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className="text-white/80">{p.purchase_date}</td>
                <td className="text-white">{supplierName[p.supplier_id] ?? "—"}</td>
                <td>
                  <span className={`admin-badge uppercase tracking-wide ${p.status === "received" ? "admin-badge-active" : "admin-badge-info"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="text-white/60">{p.currency}</td>
                <td className="text-right">
                  {p.status === "draft" ? <SalonReceivePurchaseButton purchaseId={p.id} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length === 0 ? (
          <div className="admin-empty">
            <p className="admin-empty-title">No purchases yet</p>
            <p className="admin-empty-text">
              Log a Nigeria → Liberia shipment to track incoming stock. Once you mark a purchase as received, its
              quantities are added to inventory automatically.
            </p>
            <Link
              href="/admin/purchases/new"
              className="admin-btn-primary mt-2 inline-flex min-h-[2.5rem] items-center justify-center rounded-full px-5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            >
              New purchase
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
