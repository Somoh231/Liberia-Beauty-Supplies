"use client";

import {
  createSpaceLeasePaymentAction,
  deleteSpaceLeasePaymentAction,
  updateSpaceLeasePaymentAction,
} from "@/app/actions/admin-space-lease";
import type { SpaceLeasePaymentRow } from "@/lib/admin/salon-queries";
import { formatSalonMoney, type SalonCurrency } from "@/lib/admin/salon-format";
import {
  formatSpaceLeaseConversionUnavailable,
  spaceLeaseUsdEquivCents,
} from "@/lib/admin/space-lease-currency";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.5rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

type LeaseFormCurrency = Extract<SalonCurrency, "USD" | "LRD">;

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
  const map: Record<string, string> = {
    unsupported_currency: "Currency must be USD or LRD.",
    invalid_currency: "Currency is required.",
    invalid_amount: "Enter a valid amount greater than zero.",
    invalid_fx_rate: "Operational LRD/USD rate is missing or invalid.",
    migration_required: "Apply migration 20260607120000_space_lease_payment_currency_and_margin.sql on Supabase.",
    invalid_stylist_name: "Stylist name is required.",
    invalid_week_dates: "Enter valid week dates.",
    invalid_week_range: "Week end must be on or after week start.",
    unauthorized: "Only managers and owners can edit rental payments.",
    forbidden_manager_required: "Only managers and owners can edit rental payments.",
  };
  return map[code] ?? code.replace(/_/g, " ");
}

function toFormCurrency(currency: string): LeaseFormCurrency {
  return currency === "LRD" ? "LRD" : "USD";
}

export function SpaceLeasePanel({
  rows,
  canManage,
  weekRentalUsdCents,
  monthRentalUsdCents,
  weekConversionCoverageLabel = null,
  monthConversionCoverageLabel = null,
  weekLabel = "This week (USD equiv.)",
  monthLabel = "This month (USD equiv.)",
  emptyMessage,
}: {
  rows: SpaceLeasePaymentRow[];
  canManage: boolean;
  weekRentalUsdCents: number;
  monthRentalUsdCents: number;
  weekConversionCoverageLabel?: string | null;
  monthConversionCoverageLabel?: string | null;
  weekLabel?: string;
  monthLabel?: string;
  emptyMessage?: string;
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
  const [currency, setCurrency] = useState<LeaseFormCurrency>("USD");
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
    setCurrency(toFormCurrency(row.currency));
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
            Source: space_lease_payments · Stylist fee / rental payment. Enter USD or LRD; combined totals use the stored
            USD equivalent. Conversion uses the operational LRD/USD rate saved with this payment.
          </p>
        </div>
        <div className="text-right text-xs text-white/50">
          <p>
            {weekLabel}: <span className="text-white">{formatSalonMoney(weekRentalUsdCents, "USD")}</span>
          </p>
          {weekConversionCoverageLabel ? (
            <p className="mt-0.5 text-[10px] text-amber-200/80">{weekConversionCoverageLabel}</p>
          ) : null}
          <p>
            {monthLabel}: <span className="text-white">{formatSalonMoney(monthRentalUsdCents, "USD")}</span>
          </p>
          {monthConversionCoverageLabel ? (
            <p className="mt-0.5 text-[10px] text-amber-200/80">{monthConversionCoverageLabel}</p>
          ) : null}
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
                currency,
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
              <select
                className={field}
                value={currency}
                onChange={(e) => setCurrency(e.target.value === "LRD" ? "LRD" : "USD")}
                required
              >
                <option value="USD">USD — US Dollar</option>
                <option value="LRD">LRD — Liberian Dollar</option>
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
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-white/40">
              <th className="py-2">Type</th>
              <th className="py-2">Week</th>
              <th className="py-2">Stylist</th>
              <th className="py-2">Amount</th>
              <th className="py-2">USD equiv.</th>
              {canManage ? <th className="py-2 text-right"> </th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const usd = spaceLeaseUsdEquivCents(row);
              const showFx = row.currency === "LRD" && usd != null && row.fx_lrd_per_usd != null;
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
                  <td className="py-2 text-white/75">
                    <div>{formatSalonMoney(row.amount_cents, row.currency)}</div>
                    {showFx ? (
                      <div className="mt-0.5 text-[11px] text-white/45">
                        Approx. {formatSalonMoney(usd, "USD")} at {Number(row.fx_lrd_per_usd)} LRD/USD
                        <span className="block text-[10px] text-white/35">
                          Conversion uses the operational LRD/USD rate saved with this payment.
                        </span>
                      </div>
                    ) : null}
                    {usd == null ? (
                      <div className="mt-0.5 text-[11px] text-amber-200/85">
                        {formatSpaceLeaseConversionUnavailable()}
                        <span className="block text-[10px] text-white/35">
                          No transaction-time FX snapshot — excluded from USD totals.
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 text-white/55">
                    {usd != null ? formatSalonMoney(usd, "USD") : formatSpaceLeaseConversionUnavailable()}
                  </td>
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
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-white/45">
            {emptyMessage ?? "No space lease payments logged yet."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
