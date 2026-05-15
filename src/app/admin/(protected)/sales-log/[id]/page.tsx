import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { WeeklySalesLogDetail } from "@/components/admin/weekly-sales-log-detail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryProducts, fetchWeeklyReport, type MoneyBag } from "@/lib/admin/salon-queries";
import type { SalonCurrency } from "@/lib/admin/salon-format";
import { isSalonStaffRole, requireAdminContext } from "@/lib/auth/admin-context";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Weekly log ${id.slice(0, 8)}…` };
}

function addMinor(bag: MoneyBag, currency: SalonCurrency, minor: number) {
  bag[currency] += minor;
}

export default async function AdminSalesLogDetailPage({ params }: Props) {
  const ctx = await requireAdminContext();
  if (isSalonStaffRole(ctx.roleSlug)) redirect("/admin/sales-log");

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ report, products, services, spaces }, inventory] = await Promise.all([
    fetchWeeklyReport(supabase, id),
    fetchInventoryProducts(supabase, {}),
  ]);

  if (!report) notFound();

  const productSales: MoneyBag = { USD: 0, LRD: 0, NGN: 0 };
  for (const p of products) addMinor(productSales, p.currency, p.line_total_minor);

  const serviceRevenue: MoneyBag = { USD: 0, LRD: 0, NGN: 0 };
  for (const s of services) addMinor(serviceRevenue, s.currency, s.amount_minor);

  const spacePayments: MoneyBag = { USD: 0, LRD: 0, NGN: 0 };
  for (const s of spaces) addMinor(spacePayments, s.currency, s.amount_paid_minor);

  const grandTotal: MoneyBag = { USD: 0, LRD: 0, NGN: 0 };
  (["USD", "LRD", "NGN"] as const).forEach((c) => {
    grandTotal[c] = productSales[c] + serviceRevenue[c] + spacePayments[c];
  });

  return (
    <div className="mx-auto max-w-6xl px-[max(0px,env(safe-area-inset-left))] pr-[max(0px,env(safe-area-inset-right))]">
      <WeeklySalesLogDetail
        report={report}
        products={products}
        services={services}
        spaces={spaces}
        inventory={inventory}
        summary={{ productSales, serviceRevenue, spacePayments, grandTotal }}
      />
    </div>
  );
}
