"use client";

import { saveDailyCashReconciliationAction } from "@/app/actions/admin-salon";
import { formatSalonMoney } from "@/lib/admin/salon-format";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

export function DailyReconciliationForm(props: {
  businessDate: string;
  expectedUsdCents: number;
  expectedLrdCents: number;
  initialActualUsdMajor: string;
  initialActualLrdMajor: string;
  initialNotes: string;
  savedVarianceUsdCents: number | null;
  savedVarianceLrdCents: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const lockRef = useRef(false);

  return (
    <form
      className="admin-card space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        if (lockRef.current) return;
        const fd = new FormData(e.currentTarget);
        lockRef.current = true;
        start(async () => {
          try {
            const r = await saveDailyCashReconciliationAction({
              businessDate: props.businessDate,
              actualUsd: String(fd.get("actual_usd") ?? ""),
              actualLrd: String(fd.get("actual_lrd") ?? ""),
              notes: String(fd.get("notes") ?? "") || null,
            });
            if (!r.ok) {
              setErr(r.error.replace(/_/g, " "));
              return;
            }
            router.refresh();
          } finally {
            lockRef.current = false;
          }
        });
      }}
    >
      {err ? <p className="text-sm text-red-300">{err}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Recorded (USD)</p>
          <p className="mt-1 text-lg text-white">{formatSalonMoney(props.expectedUsdCents, "USD")}</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-white/35">Counted USD</p>
          <input
            name="actual_usd"
            className={field}
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={props.initialActualUsdMajor}
            required
          />
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Recorded (LRD)</p>
          <p className="mt-1 text-lg text-white">{formatSalonMoney(props.expectedLrdCents, "LRD")}</p>
          <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-white/35">Counted LRD</p>
          <input
            name="actual_lrd"
            className={field}
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={props.initialActualLrdMajor}
            required
          />
        </div>
      </div>
      <label className="block text-xs text-white/55">
        Notes (discrepancies)
        <textarea name="notes" rows={3} className={field} defaultValue={props.initialNotes} placeholder="Optional" />
      </label>
      {props.savedVarianceUsdCents != null && props.savedVarianceLrdCents != null ? (
        <p className="text-[11px] text-white/50">
          Last saved variance: {formatSalonMoney(props.savedVarianceUsdCents, "USD")} USD ·{" "}
          {formatSalonMoney(props.savedVarianceLrdCents, "LRD")} LRD
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[var(--admin-accent)] px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save reconciliation"}
      </button>
    </form>
  );
}
