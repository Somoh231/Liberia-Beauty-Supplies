"use client";

import {
  createSpaceLeasePaymentAction,
  deleteSpaceLeasePaymentAction,
  updateSpaceLeasePaymentAction,
} from "@/app/actions/admin-space-lease";
import type { SpaceLeasePaymentRow } from "@/lib/admin/salon-queries";
import { currencyShortLabel, formatSalonMoney, normalizeCurrency, type SalonCurrency } from "@/lib/admin/salon-format";
import { lineRevenueUsdEquivCents } from "@/lib/admin/salon-finance";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.5rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

function currentWeekRange(): { start: string; end: string } {
  const d = new Date();
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function errMsg(code: string): string {
  return code.replace(/_/g, " ");
}

export function SpaceLeasePanel({
  rows,
  canManage,
  weekRentalUsdCents,
  monthRentalUsdCents,
}: {
  rows: SpaceLeasePaymentRow[];
  canManage: boolean;
  weekRentalUsdCents: number;
  monthRentalUsdCents: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const week = useMemo(() => currentWeekRange(), []);
  const [stylistName, setStylistName] = useState("");
  const [weekStart, setWeekStart] = useState(week.start);
  const [weekEnd, setWeekEnd] = useState(week.end);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<SalonCurrency>("USD");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetForm() {
    const w = currentWeekRange();
    setStylistName("");
    setWeekStart(w.start);
    setWeekEnd(w.end);
    setAmount("");
    setCurrency("USD");
    setNotes("");
    setEditingId(null);
  }

  function loadRow(row: SpaceLeasePaymentRow) {
    setEditingId(row.id);
    setStylistName(row.stylist_name);
    setWeekStart(row.week_start_date);
    setWeekEnd(row.week_end_date);
    setAmount((row.amount_cents / 100).toFixed(2));
    setCurrency(row.currency);
    setNotes(row.notes ?? "");
  }

  return (
    <section className="admin-card space-y-5 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">
            Stylist fee / rental payments
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-white/40">
            Source: space_lease_payments · Stylist fee / rental payment. Booth and chair rent from stylists — operating
            revenue, separate from retail and service totals. Edits update the existing payment (no duplicate).
          </p>
        </div>
        <div className="text-right text-xs text-white/50">
          <p>
            This week: <span className="text-white">{formatSalonMoney(weekRentalUsdCents, "USD")}</span>
          </p>
          <p>
            This month: <span className="text-white">{formatSalonMoney(monthRentalUsdCents, "USD")}</span>
          </p>
        </div>
      </div>

      {canManage ? (
        <form
          className="space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            setOkMsg(null);
            start(async () => {
              const payload = {
                stylistName,
                weekStartDate: weekStart,
                weekEndDate: weekEnd,
                amount,
                currency: normalizeCurrency(currency),
                notes: notes || null,
              };
              const r = editingId
                ? await updateSpaceLeasePaymentAction({ id: editingId, ...payload })
                : await createSpaceLeasePaymentAction(payload);
              if (!r.ok) {
                setErr(errMsg(r.error));
                return;
              }
              setOkMsg(editingId ? "Rental payment updated." : "Rental payment added.");
              resetForm();
              router.refresh();
            });
          }}
        >
          {err ? <p className="text-sm text-red-300">{err}</p> : null}
          {okMsg ? <p className="text-sm text-emerald-300">{okMsg}</p> : null}
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            {editingId ? "Edit stylist fee / rental payment" : "Log weekly payment"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-white/55 sm:col-span-2">
              Stylist name
              <input className={field} value={stylistName} onChange={(e) => setStylistName(e.target.value)} required />
            </label>
            <label className="block text-xs text-white/55">
              Week start
              <input type="date" className={field} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} required />
            </label>
            <label className="block text-xs text-white/55">
              Week end
              <input type="date" className={field} value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} required />
            </label>
            <label className="block text-xs text-white/55">
              Amount paid
              <input className={field} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </label>
            <label className="block text-xs text-white/55">
              Currency
              <select className={field} value={currency} onChange={(e) => setCurrency(normalizeCurrency(e.target.value))}>
                <option value="USD">USD</option>
                <option value="LRD">{currencyShortLabel("LRD")}</option>
                <option value="NGN">NGN</option>
              </select>
            </label>
            <label className="block text-xs text-white/55 sm:col-span-2">
              Notes (optional)
              <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="admin-btn-primary rounded-full px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
            >
              {pending ? "Saving…" : editingId ? "Update" : "Add payment"}
            </button>
            {editingId ? (
              <button
                type="button"
                className="admin-btn-secondary rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                onClick={resetForm}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-xs text-white/45">Only managers and owners can add or edit rental payments.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/40">
              <th className="py-2">Type</th>
              <th className="py-2">Week</th>
              <th className="py-2">Stylist</th>
              <th className="py-2">Amount</th>
              <th className="py-2 text-right">USD equiv.</th>
              {canManage ? <th className="py-2 text-right"> </th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const usd = lineRevenueUsdEquivCents(row.amount_cents, 1, row.currency);
              return (
                <tr key={row.id} className="border-b border-white/[0.06]">
                  <td className="py-2">
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-100/85">
                      Rental
                    </span>
                  </td>
                  <td className="py-2 text-white/70">
                    {row.week_start_date}
                    <span className="text-white/35"> → </span>
                    {row.week_end_date}
                  </td>
                  <td className="py-2 text-white">{row.stylist_name}</td>
                  <td className="py-2 text-white/75">{formatSalonMoney(row.amount_cents, row.currency)}</td>
                  <td className="py-2 text-right text-white/55">{formatSalonMoney(usd, "USD")}</td>
                  {canManage ? (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="mr-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]"
                        onClick={() => {
                          setOkMsg(null);
                          setErr(null);
                          loadRow(row);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300/80"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(`Delete rental payment for ${row.stylist_name}?`)) return;
                          start(async () => {
                            const r = await deleteSpaceLeasePaymentAction({ id: row.id });
                            if (!r.ok) setErr(errMsg(r.error));
                            else router.refresh();
                          });
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-4 text-sm text-white/45">No space lease payments logged yet.</p> : null}
      </div>
    </section>
  );
}
