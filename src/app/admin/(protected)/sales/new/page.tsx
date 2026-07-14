import type { Metadata } from "next";
import Link from "next/link";
import { SalonRetailSaleBatchForm } from "@/components/admin/salon-retail-sale-batch-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchSellableInventoryProducts, fetchOperationalSettings } from "@/lib/admin/salon-queries";
import { formatOperationalFxSummaryLineFromRates, resolveOperationalFxFromSettings } from "@/lib/admin/pricing-engine";
import { requireAdminContext, isSalonStaffRole } from "@/lib/auth/admin-context";

export const metadata: Metadata = { title: "Sale" };
export const dynamic = "force-dynamic";

export default async function AdminSalesNewPage() {
  const ctx = await requireAdminContext();
  const staff = isSalonStaffRole(ctx.roleSlug);
  const supabase = await createSupabaseServerClient();
  const [items, settings] = await Promise.all([fetchSellableInventoryProducts(supabase), fetchOperationalSettings(supabase)]);
  const opFx = resolveOperationalFxFromSettings(settings);
  const fxLine = formatOperationalFxSummaryLineFromRates(opFx);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Sale</h1>
        <p className="mt-1 text-sm text-white/50">
          Fast retail lines — only ready, priced retail products appear here. Assets and incomplete catalog seeds are
          excluded.
        </p>
      </div>
      <SalonRetailSaleBatchForm
        items={items}
        staff={staff}
        operationalFxSummaryLine={fxLine}
        operationalFx={opFx}
      />
    </div>
  );
}
