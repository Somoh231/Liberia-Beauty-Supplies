import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SalonSaleEditForm } from "@/components/admin/salon-sale-edit-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryItem, fetchInventoryProducts, fetchRetailSaleById } from "@/lib/admin/salon-queries";
import { requireAdminContext } from "@/lib/auth/admin-context";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit sale ${id.slice(0, 8)}…` };
}

export default async function AdminSaleEditPage({ params }: Props) {
  const ctx = await requireAdminContext();
  if (!ctx.isManagerOrAbove) redirect("/admin/sales-log");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [sale, items] = await Promise.all([
    fetchRetailSaleById(supabase, id),
    fetchInventoryProducts(supabase, {}),
  ]);

  if (!sale) notFound();

  const activeItems = items.filter((i) => i.active);
  const saleLineItem = await fetchInventoryItem(supabase, sale.inventory_item_id);
  const pickerItems =
    saleLineItem && !activeItems.some((i) => i.id === saleLineItem.id)
      ? [saleLineItem, ...activeItems]
      : activeItems;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <Link href="/admin/sales-log" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Sale log
      </Link>
      <header className="space-y-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Edit retail sale</h1>
        <p className="text-sm text-white/50">
          {sale.product_name} · logged {new Date(sale.sold_at).toLocaleString()}
        </p>
      </header>
      <SalonSaleEditForm sale={sale} items={pickerItems} />
    </div>
  );
}
