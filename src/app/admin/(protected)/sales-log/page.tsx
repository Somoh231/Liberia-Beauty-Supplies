import type { Metadata } from "next";
import Link from "next/link";
import { NewWeeklySalesReportForm } from "@/components/admin/weekly-sales-log-new-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWeeklyReports } from "@/lib/admin/salon-queries";

export const metadata: Metadata = { title: "Sales log" };
export const dynamic = "force-dynamic";

export default async function AdminSalesLogIndexPage() {
  const supabase = await createSupabaseServerClient();
  const reports = await fetchWeeklyReports(supabase);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Weekly sales log</h1>
        <p className="max-w-2xl text-sm text-white/50">
          Open a week to record product sales (inventory updates automatically), services, and stylist space payments.
        </p>
      </header>

      <NewWeeklySalesReportForm />

      <section className="admin-card overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Staff on duty</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"> </th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="border-b border-white/[0.06]">
                <td className="px-4 py-3 text-white">
                  {r.start_date} <span className="text-white/40">→</span> {r.end_date}
                </td>
                <td className="px-4 py-3 text-white/70">{r.staff_on_duty ?? "—"}</td>
                <td className="px-4 py-3 text-white/55">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/sales-log/${r.id}`}
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports.length === 0 ? <p className="p-6 text-sm text-white/45">No weekly reports yet — start one above.</p> : null}
      </section>
    </div>
  );
}
