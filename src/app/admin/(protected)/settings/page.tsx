import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OperationalSettingsForm } from "@/components/admin/operational-settings-form";
import { requireAdminContext } from "@/lib/auth/admin-context";
import { fetchOperationalSettings } from "@/lib/admin/salon-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AdminOperationalSettingsPage() {
  const ctx = await requireAdminContext();
  if (!ctx.isManagerOrAbove) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  const row = await fetchOperationalSettings(supabase);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Operational settings</h1>
        <p className="mt-1 text-sm text-white/50">Central FX rates and warning thresholds — minimal controls for daily ops.</p>
      </div>
      <OperationalSettingsForm row={row} />
    </div>
  );
}
