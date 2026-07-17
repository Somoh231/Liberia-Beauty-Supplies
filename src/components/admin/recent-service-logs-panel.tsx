import Link from "next/link";
import type { ServiceLogRow } from "@/lib/admin/salon-queries";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import { salesLogRecordKindLabel } from "@/lib/admin/sales-log-edit";

export function RecentServiceLogsPanel({
  logs,
  canEdit,
  returnTo = "/admin/sales-log",
  emptyMessage = "No service transactions in this filter range.",
  title = "Service transactions",
}: {
  logs: ServiceLogRow[];
  canEdit: boolean;
  returnTo?: string;
  emptyMessage?: string;
  title?: string;
}) {
  return (
    <section className="admin-card overflow-x-auto p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{title}</h2>
          <p className="mt-1 text-xs text-white/40">
            Source: service_logs · {salesLogRecordKindLabel("service_transaction")}.{" "}
            {canEdit ? "Managers can edit posted services." : ""}
          </p>
        </div>
        <Link
          href="/admin/services/new"
          className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]"
        >
          + New service
        </Link>
      </div>
      <table className="mt-4 w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/40">
            <th className="py-2">Type</th>
            <th className="py-2">Date</th>
            <th className="py-2">Service</th>
            <th className="py-2">Tech</th>
            <th className="py-2 text-right">Amount</th>
            {canEdit ? <th className="py-2 text-right"> </th> : null}
          </tr>
        </thead>
        <tbody>
          {logs.map((row) => (
            <tr key={row.id} className="border-b border-white/[0.06]">
              <td className="py-2">
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-violet-100/85">
                  Service
                </span>
              </td>
              <td className="py-2 text-white/70">{row.sold_at.slice(0, 10)}</td>
              <td className="py-2 text-white">{row.service_category ?? row.service_name}</td>
              <td className="py-2 text-white/55">{row.staff_name ?? "—"}</td>
              <td className="py-2 text-right text-white/75">
                {formatSalonMoney(row.revenue_cents, row.currency)}
              </td>
              {canEdit ? (
                <td className="py-2 text-right">
                  <Link
                    href={`/admin/services/${row.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                  >
                    Edit
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {logs.length === 0 ? <p className="py-4 text-sm text-white/45">{emptyMessage}</p> : null}
    </section>
  );
}
