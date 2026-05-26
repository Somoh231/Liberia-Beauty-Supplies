import type { Metadata } from "next";
import Link from "next/link";
import { SalonSupplierCreateForm } from "@/components/admin/salon-supplier-create-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSuppliersAdminPage } from "@/lib/admin/inventory-form-bootstrap";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);
  const supabase = await createSupabaseServerClient();
  const { rows, restock, loadErrors } = await loadSuppliersAdminPage(supabase);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Suppliers</h1>
      <p className="text-sm text-white/50">Lightweight directory for restock workflows.</p>
      {loadErrors.length > 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          Some supplier data could not be loaded ({loadErrors.join(", ")}). Check server logs for{" "}
          <code className="text-[11px]">[admin-debug]</code> entries.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="admin-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Last restock</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((s) => (
                <tr key={s.id} className="border-b border-white/[0.06]">
                  <td className="px-4 py-3 text-white">
                    {s.name ?? "—"}
                    {!s.active ? <span className="ml-2 text-[10px] uppercase text-white/35">inactive</span> : null}
                  </td>
                  <td className="px-4 py-3 text-white/60">{s.country_origin ?? "—"}</td>
                  <td className="px-4 py-3 text-white/55">{s.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-white/55">{s.product_category ?? "—"}</td>
                  <td className="px-4 py-3 text-white/55">
                    {s.id && restock[s.id] ? new Date(restock[s.id] as string).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {staff ? (
          <div className="admin-card p-5 text-sm text-white/50">Only managers and owners can add or edit supplier records.</div>
        ) : (
          <SalonSupplierCreateForm />
        )}
      </div>
    </div>
  );
}
