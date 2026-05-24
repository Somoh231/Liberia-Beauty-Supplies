import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DailyReconciliationForm } from "@/components/admin/daily-reconciliation-form";
import { requireAdminContext } from "@/lib/auth/admin-context";
import { fetchCashActivityForBusinessDate, fetchDailyCashReconciliationForDate } from "@/lib/admin/salon-queries";
import { getMonroviaDayKey } from "@/lib/admin/salon-format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reconcile" };
export const dynamic = "force-dynamic";

type Search = { date?: string };

export default async function AdminReconcilePage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await requireAdminContext();
  if (!ctx.isManagerOrAbove) redirect("/admin");

  const sp = await searchParams;
  const day =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date.trim()) ? sp.date.trim() : getMonroviaDayKey();

  const supabase = await createSupabaseServerClient();
  const [snap, existing] = await Promise.all([
    fetchCashActivityForBusinessDate(supabase, day),
    fetchDailyCashReconciliationForDate(supabase, day),
  ]);

  const expectedUsd = snap.retailNative.USD + snap.serviceNative.USD;
  const expectedLrd = snap.retailNative.LRD + snap.serviceNative.LRD;

  const initialUsd =
    existing?.actual_usd_cents != null ? (existing.actual_usd_cents / 100).toFixed(2) : (expectedUsd / 100).toFixed(2);
  const initialLrd =
    existing?.actual_lrd_cents != null ? (existing.actual_lrd_cents / 100).toFixed(2) : (expectedLrd / 100).toFixed(2);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Cash reconciliation</h1>
        <p className="mt-1 text-sm text-white/50">
          End-of-day counted cash vs recorded retail and service takings (native USD/LRD) for the selected Monrovia
          business date.
        </p>
      </div>

      <form action="/admin/reconcile" method="get" className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-white/55">
          Business date
          <input
            type="date"
            name="date"
            defaultValue={day}
            className="mt-1 block rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-white/18 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85"
        >
          Load
        </button>
      </form>

      <DailyReconciliationForm
        businessDate={day}
        expectedUsdCents={expectedUsd}
        expectedLrdCents={expectedLrd}
        initialActualUsdMajor={initialUsd}
        initialActualLrdMajor={initialLrd}
        initialNotes={existing?.notes ?? ""}
        savedVarianceUsdCents={existing ? existing.variance_usd_cents : null}
        savedVarianceLrdCents={existing ? existing.variance_lrd_cents : null}
      />
    </div>
  );
}
