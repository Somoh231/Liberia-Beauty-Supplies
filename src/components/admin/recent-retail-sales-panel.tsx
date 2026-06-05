import Link from "next/link";
import type { RetailSaleListRow } from "@/lib/admin/salon-queries";
import { formatSalonMoney } from "@/lib/admin/salon-format";

export function RecentRetailSalesPanel({
  sales,
  canEdit,
}: {
  sales: RetailSaleListRow[];
  canEdit: boolean;
}) {
  return (
    <section className="admin-card overflow-x-auto p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Recent retail sales</h2>
          <p className="mt-1 text-xs text-white/40">Last 90 days from the Sale module. {canEdit ? "Managers can edit posted sales." : ""}</p>
        </div>
        <Link
          href="/admin/sales/new"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]"
        >
          + New sale
        </Link>
      </div>
      <table className="mt-4 w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/40">
            <th className="py-2">Date</th>
            <th className="py-2">Product</th>
            <th className="py-2">Qty</th>
            <th className="py-2">Price</th>
            <th className="py-2 text-right">Revenue (USD)</th>
            {canEdit ? <th className="py-2 text-right"> </th> : null}
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => {
            const rev = s.revenue_usd_equiv_cents ?? Math.round(s.qty * s.unit_price_cents);
            return (
              <tr key={s.id} className="border-b border-white/[0.06]">
                <td className="py-2 text-white/70">{s.sold_at.slice(0, 10)}</td>
                <td className="py-2 text-white">
                  {s.product_name}
                  {s.product_code ? <span className="ml-1 text-[10px] text-white/35">{s.product_code}</span> : null}
                </td>
                <td className="py-2 text-white/60">{s.qty}</td>
                <td className="py-2 text-white/60">{formatSalonMoney(s.unit_price_cents, s.currency)}</td>
                <td className="py-2 text-right text-white/75">{formatSalonMoney(rev, "USD")}</td>
                {canEdit ? (
                  <td className="py-2 text-right">
                    <Link
                      href={`/admin/sales/${s.id}/edit`}
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                    >
                      Edit
                    </Link>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {sales.length === 0 ? <p className="py-4 text-sm text-white/45">No retail sales in the last 90 days.</p> : null}
    </section>
  );
}
