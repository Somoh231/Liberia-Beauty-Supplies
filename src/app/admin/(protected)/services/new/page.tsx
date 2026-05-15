import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SalonServiceBatchForm } from "@/components/admin/salon-service-batch-form";
import { ServiceHistoryPanel } from "@/components/admin/service-history-panel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchServiceLogHistory } from "@/lib/admin/salon-queries";

export const metadata: Metadata = { title: "Service" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function AdminServiceLogPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const history = await fetchServiceLogHistory(supabase, { search: q, limit: 60 });

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Service</h1>
        <p className="mt-1 text-sm text-white/50">
          Log salon services by category. Optional client name, phone, and Facebook for repeat-client lookup.
        </p>
      </div>
      <SalonServiceBatchForm />
      <Suspense fallback={<section className="admin-card p-6 text-sm text-white/40">Loading history…</section>}>
        <ServiceHistoryPanel initialRows={history} />
      </Suspense>
    </div>
  );
}
