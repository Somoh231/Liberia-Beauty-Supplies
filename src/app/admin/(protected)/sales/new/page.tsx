import type { Metadata } from "next";
import Link from "next/link";
import { SalonRetailSaleBatchForm } from "@/components/admin/salon-retail-sale-batch-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryItems } from "@/lib/admin/salon-queries";

export const metadata: Metadata = { title: "Sale" };
export const dynamic = "force-dynamic";

export default async function AdminSalesNewPage() {
  const supabase = await createSupabaseServerClient();
  const items = (await fetchInventoryItems(supabase)).filter((i) => i.active);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Sale</h1>
        <p className="mt-1 text-sm text-white/50">Fast retail lines — stock and the sale log update automatically.</p>
      </div>
      <SalonRetailSaleBatchForm items={items} />
    </div>
  );
}
