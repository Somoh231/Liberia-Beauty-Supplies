"use client";

import Link from "next/link";
import type { ServiceLogRow } from "@/lib/admin/salon-queries";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

const field =
  "w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

function customerLine(row: ServiceLogRow) {
  const parts: string[] = [];
  if (row.customer_name?.trim()) parts.push(row.customer_name.trim());
  if (row.customer_phone?.trim()) parts.push(row.customer_phone.trim());
  if (row.customer_facebook?.trim()) parts.push(row.customer_facebook.trim());
  return parts.length ? parts.join(" · ") : null;
}

export function ServiceHistoryPanel({
  initialRows,
  canEdit = false,
}: {
  initialRows: ServiceLogRow[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQ(searchParams.get("q") ?? "");
  }, [searchParams]);

  const applySearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed.length >= 2) params.set("q", trimmed);
      else params.delete("q");
      const qs = params.toString();
      start(() => {
        router.replace(qs ? `/admin/services/new?${qs}` : "/admin/services/new", { scroll: false });
      });
    },
    [router, searchParams],
  );

  return (
    <section className="admin-card space-y-4 p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Service history</h2>
          <p className="mt-1 text-xs text-white/40">Search by client name, phone, Facebook, technician, or service type.</p>
        </div>
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applySearch(q);
          }}
        >
          <input
            className={field}
            placeholder="Search clients…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search service history"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 min-h-[2.75rem] rounded-full border border-white/15 px-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 disabled:opacity-50"
          >
            Search
          </button>
        </form>
      </div>

      <div className="max-h-80 overflow-y-auto admin-x-scroll">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="sticky top-0 bg-[#0c0c0e]">
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/40">
              <th className="py-2 pr-2">Date</th>
              <th className="py-2 pr-2">Service</th>
              <th className="py-2 pr-2">Client</th>
              <th className="py-2 pr-2">Tech</th>
              <th className="py-2 text-right">Amount</th>
              {canEdit ? <th className="py-2 text-right"> </th> : null}
            </tr>
          </thead>
          <tbody>
            {initialRows.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="py-6 text-center text-white/40">
                  {searchParams.get("q") ? "No matches for this search." : "No service entries yet."}
                </td>
              </tr>
            ) : null}
            {initialRows.map((row) => {
              const client = customerLine(row);
              const day = row.sold_at.slice(0, 10);
              return (
                <tr key={row.id} className="border-b border-white/[0.06] text-white/75">
                  <td className="py-2 pr-2 text-white/55">{day}</td>
                  <td className="py-2 pr-2 text-white">{row.service_category ?? row.service_name}</td>
                  <td className="py-2 pr-2 text-white/70">{client ?? "—"}</td>
                  <td className="py-2 pr-2 text-white/55">{row.staff_name ?? "—"}</td>
                  <td className="py-2 text-right text-[var(--admin-accent)]">
                    {formatSalonMoney(row.revenue_cents, row.currency)}
                  </td>
                  {canEdit ? (
                    <td className="py-2 text-right">
                      <Link
                        href={`/admin/services/${row.id}/edit?returnTo=${encodeURIComponent("/admin/services/new")}`}
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
      </div>
    </section>
  );
}
