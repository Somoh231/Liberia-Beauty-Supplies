import type { Metadata } from "next";
import Link from "next/link";
import { SalonSupplierCreateForm } from "@/components/admin/salon-supplier-create-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllSuppliersAdmin } from "@/lib/admin/salon-queries";

export const metadata: Metadata = { title: "Suppliers" };
export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const supabase = await createSupabaseServerClient();
  const rows = await fetchAllSuppliersAdmin(supabase);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Suppliers</h1>
      <p className="text-sm text-white/50">Wholesale partners (often in Nigeria) for supply runs.</p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="admin-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Phone</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-white/[0.06]">
                  <td className="px-4 py-3 text-white">
                    {s.name}
                    {!s.active ? <span className="ml-2 text-[10px] uppercase text-white/35">inactive</span> : null}
                  </td>
                  <td className="px-4 py-3 text-white/60">{s.country_origin}</td>
                  <td className="px-4 py-3 text-white/55">{s.contact_name ?? "—"}</td>
                  <td className="px-4 py-3 text-white/55">{s.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SalonSupplierCreateForm />
      </div>
    </div>
  );
}
