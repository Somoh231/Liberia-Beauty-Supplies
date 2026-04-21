import type { Metadata } from "next";
import Link from "next/link";
import { SalonServiceLogForm } from "@/components/admin/salon-service-log-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryItems } from "@/lib/admin/salon-queries";

export const metadata: Metadata = { title: "Log service" };
export const dynamic = "force-dynamic";

export default async function AdminServiceLogPage() {
  const supabase = await createSupabaseServerClient();
  const items = (await fetchInventoryItems(supabase)).filter((i) => i.active);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Log salon service</h1>
        <p className="mt-1 text-sm text-white/50">Records service revenue. Optionally deduct retail products used.</p>
      </div>
      <SalonServiceLogForm items={items} />
    </div>
  );
}
