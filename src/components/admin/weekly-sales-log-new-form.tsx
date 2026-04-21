"use client";

import { createWeeklyReportAction } from "@/app/actions/admin-weekly-sales-log";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

export function NewWeeklySalesReportForm() {
  const router = useRouter();
  const [pending, run] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [staff, setStaff] = useState("");

  useEffect(() => {
    const t = new Date();
    const mon = new Date(t);
    const day = mon.getDay();
    const diff = mon.getDate() - day + (day === 0 ? -6 : 1);
    mon.setDate(diff);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    setStartDate(iso(mon));
    setEndDate(iso(sun));
  }, []);

  return (
    <section className="admin-card space-y-4 p-6">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">Start new weekly report</h2>
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs text-white/55">
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} required />
        </label>
        <label className="block text-xs text-white/55">
          End date
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} required />
        </label>
        <label className="block text-xs text-white/55 sm:col-span-2 lg:col-span-1">
          Staff on duty
          <input value={staff} onChange={(e) => setStaff(e.target.value)} className={field} placeholder="Optional" />
        </label>
      </div>
      <button
        type="button"
        disabled={pending || !startDate || !endDate}
        onClick={() => {
          setErr(null);
          run(async () => {
            const r = await createWeeklyReportAction({
              startDate: startDate,
              endDate: endDate,
              staffOnDuty: staff || null,
            });
            if (!r.ok) {
              setErr(r.error.replace(/_/g, " "));
              return;
            }
            if (r.id) router.push(`/admin/sales-log/${r.id}`);
            else router.refresh();
          });
        }}
        className="rounded-full bg-[var(--admin-accent)] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
      >
        {pending ? "Creating…" : "Start new weekly report"}
      </button>
    </section>
  );
}
