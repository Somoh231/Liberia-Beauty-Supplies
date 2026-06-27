import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InventoryCatalogResetPanel } from "@/components/admin/inventory-catalog-reset-panel";
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
    <div className="space-y-8 pb-4">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">Operational settings</h1>
        <p className="max-w-2xl text-sm text-white/50">Central FX rates and warning thresholds — minimal controls for daily ops.</p>
      </header>
      {/* Forms stay readable-width (forms are out of scope this phase). */}
      <div className="max-w-3xl space-y-8">
        <OperationalSettingsForm row={row} />
        {ctx.isOwner ? <InventoryCatalogResetPanel /> : null}
      </div>
    </div>
  );
}
