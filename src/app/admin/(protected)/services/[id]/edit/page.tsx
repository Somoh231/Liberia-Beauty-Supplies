import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SalonServiceEditForm } from "@/components/admin/salon-service-edit-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchInventoryProducts, fetchServiceLogById } from "@/lib/admin/salon-queries";
import { requireAdminContext } from "@/lib/auth/admin-context";
import { sanitizeAdminReturnTo } from "@/lib/admin/safe-admin-return-to";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit service ${id.slice(0, 8)}…` };
}

export default async function AdminServiceEditPage({ params, searchParams }: Props) {
  const ctx = await requireAdminContext();
  if (!ctx.isManagerOrAbove) redirect("/admin/sales-log");

  const { id } = await params;
  const sp = await searchParams;
  const returnTo = sanitizeAdminReturnTo(sp.returnTo);

  const supabase = await createSupabaseServerClient();
  const [log, items] = await Promise.all([
    fetchServiceLogById(supabase, id),
    fetchInventoryProducts(supabase),
  ]);

  if (!log) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <Link href={returnTo} className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Sale log
      </Link>
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Service transaction</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">Edit service</h1>
        <p className="text-sm text-white/50">
          {log.service_name} · logged {new Date(log.sold_at).toLocaleString()}
        </p>
      </header>
      <SalonServiceEditForm log={log} items={items} returnTo={returnTo} />
    </div>
  );
}
