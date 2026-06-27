import type { Metadata } from "next";
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
    <div className="space-y-8 pb-4">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">Suppliers</h1>
        <p className="max-w-2xl text-sm text-white/50">Lightweight directory for restock workflows.</p>
      </header>
      {loadErrors.length > 0 ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          Some supplier data could not be loaded ({loadErrors.join(", ")}). Check server logs for{" "}
          <code className="text-[11px]">[admin-debug]</code> entries.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="admin-card overflow-x-auto">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Country</th>
                <th>Phone</th>
                <th>Category</th>
                <th>Last restock</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((s) => (
                <tr key={s.id}>
                  <td className="text-white">
                    {s.name ?? "—"}
                    {!s.active ? <span className="ml-2 text-[10px] uppercase text-white/35">inactive</span> : null}
                  </td>
                  <td className="text-white/60">{s.country_origin ?? "—"}</td>
                  <td className="text-white/55">{s.phone ?? "—"}</td>
                  <td className="text-white/55">{s.product_category ?? "—"}</td>
                  <td className="text-white/55">
                    {s.id && restock[s.id] ? new Date(restock[s.id] as string).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(rows ?? []).length === 0 ? (
            <div className="admin-empty">
              <p className="admin-empty-title">No suppliers yet</p>
              <p className="admin-empty-text">
                Add the vendors you restock from so purchases and landed-cost tracking can link back to a source.
                {staff ? " Ask a manager or owner to add the first supplier." : " Use the form to add your first one."}
              </p>
            </div>
          ) : null}
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
