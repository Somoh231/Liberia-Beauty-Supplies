"use client";

import { createServiceLogsBatchAction, type ServiceLogLineInput } from "@/app/actions/admin-salon";
import { SERVICE_CATEGORY_OPTIONS } from "@/lib/admin/salon-finance";
import { currencyShortLabel, normalizeCurrency, type SalonCurrency } from "@/lib/admin/salon-format";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

const field =
  "mt-1 w-full min-h-[2.75rem] rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30 sm:min-h-0";

const fieldCompact =
  "mt-0.5 w-full min-h-[2.35rem] rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs text-white placeholder:text-white/30 focus:border-[var(--admin-accent)]/40 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/25 sm:min-h-0";

type Row = ServiceLogLineInput & { key: string };

function newRow(): Row {
  return {
    key: crypto.randomUUID(),
    serviceCategory: SERVICE_CATEGORY_OPTIONS[0],
    revenue: "",
    currency: "USD",
    staffName: "",
    notes: "",
    customerName: "",
    customerPhone: "",
    customerFacebook: "",
  };
}

const SERVICE_DRAFT_KEY = "salon_draft_service_batch_v1";

export function SalonServiceBatchForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, newRow));
  const submitLockRef = useRef(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = localStorage.getItem(SERVICE_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { serviceDate?: string; rows?: Row[] };
      if (!parsed?.rows?.length) return;
      if (window.confirm("Restore unsaved service draft from this device?")) {
        if (parsed.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.serviceDate)) setServiceDate(parsed.serviceDate);
        setRows(
          parsed.rows.map((r) => ({
            ...newRow(),
            ...r,
            key: r.key && typeof r.key === "string" ? r.key : crypto.randomUUID(),
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const draftDirty = useMemo(
    () =>
      rows.some(
        (r) =>
          (r.revenue && r.revenue.trim() !== "") ||
          (r.staffName && r.staffName.trim() !== "") ||
          (r.notes && r.notes.trim() !== "") ||
          (r.customerName && r.customerName.trim() !== "") ||
          (r.customerPhone && r.customerPhone.trim() !== "") ||
          (r.customerFacebook && r.customerFacebook.trim() !== ""),
      ),
    [rows],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!draftDirty) {
        localStorage.removeItem(SERVICE_DRAFT_KEY);
        return;
      }
      localStorage.setItem(SERVICE_DRAFT_KEY, JSON.stringify({ serviceDate, rows }));
    }, 600);
    return () => window.clearTimeout(t);
  }, [rows, serviceDate, draftDirty]);

  useEffect(() => {
    if (!draftDirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [draftDirty]);

  const totals = rows.reduce(
    (acc, r) => {
      const n = Number(String(r.revenue).replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= 0) return acc;
      const c = normalizeCurrency(r.currency);
      if (c === "USD") acc.usd += n;
      if (c === "LRD") acc.ld += n;
      return acc;
    },
    { usd: 0, ld: 0 },
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="admin-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Total (lines)</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-white">
            {(totals.usd + totals.ld).toFixed(2)}
          </p>
          <p className="text-xs text-white/40">Preview only — not saved until submit.</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">USD lines</p>
          <p className="mt-1 text-lg text-white">{totals.usd.toFixed(2)} USD</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{currencyShortLabel("LRD")} lines</p>
          <p className="mt-1 text-lg text-white">{totals.ld.toFixed(2)} LD</p>
        </div>
      </div>

      <form
        className="admin-card space-y-5 p-5 pb-28 sm:p-6 sm:pb-6"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          if (submitLockRef.current || pending) return;
          submitLockRef.current = true;
          start(async () => {
            try {
              const lines: ServiceLogLineInput[] = rows
                .filter((r) => r.serviceCategory && r.revenue)
                .map((r) => ({
                  serviceCategory: r.serviceCategory,
                  revenue: r.revenue,
                  currency: normalizeCurrency(r.currency),
                  staffName: r.staffName || null,
                  notes: r.notes || null,
                  customerName: r.customerName || null,
                  customerPhone: r.customerPhone || null,
                  customerFacebook: r.customerFacebook || null,
                }));
              const res = await createServiceLogsBatchAction({ serviceDate, lines });
              if (!res.ok) {
                setErr(res.error.replace(/_/g, " "));
                return;
              }
              localStorage.removeItem(SERVICE_DRAFT_KEY);
              setRows(Array.from({ length: 5 }, newRow));
              router.refresh();
            } finally {
              submitLockRef.current = false;
            }
          });
        }}
      >
        {err ? <p className="text-sm text-red-300">{err}</p> : null}
        <label className="block text-xs text-white/55">
          Service date
          <input type="date" className={field} value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required />
        </label>

        <div className="space-y-3">
          <div className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40 md:grid md:grid-cols-[1.1fr_0.75fr_0.55fr_0.75fr] md:gap-2">
            <span>Service type</span>
            <span>Amount</span>
            <span>CCY</span>
            <span>Technician</span>
          </div>
          {rows.map((row, idx) => (
            <div
              key={row.key}
              className="space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 md:border-0 md:bg-transparent md:p-0"
            >
              <div className="grid gap-2 md:grid-cols-[1.1fr_0.75fr_0.55fr_0.75fr] md:items-end">
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 md:hidden">
                  Service type
                </label>
                <select
                  className={field}
                  value={row.serviceCategory}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => {
                      const next = [...rs];
                      next[idx] = { ...next[idx], serviceCategory: v };
                      return next;
                    });
                  }}
                >
                  {SERVICE_CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 md:hidden">
                  Amount
                </label>
                <input
                  className={field}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={row.revenue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => {
                      const next = [...rs];
                      next[idx] = { ...next[idx], revenue: v };
                      return next;
                    });
                  }}
                />
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 md:hidden">
                  Currency
                </label>
                <select
                  className={field}
                  value={row.currency}
                  onChange={(e) => {
                    const v = normalizeCurrency(e.target.value) as SalonCurrency;
                    setRows((rs) => {
                      const next = [...rs];
                      next[idx] = { ...next[idx], currency: v };
                      return next;
                    });
                  }}
                >
                  <option value="USD">USD</option>
                  <option value="LRD">{currencyShortLabel("LRD")}</option>
                </select>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45 md:hidden">
                  Technician
                </label>
                <input
                  className={field}
                  placeholder="Optional"
                  value={row.staffName ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => {
                      const next = [...rs];
                      next[idx] = { ...next[idx], staffName: v };
                      return next;
                    });
                  }}
                />
              </div>

              <div className="grid gap-2 border-t border-white/[0.06] pt-2 sm:grid-cols-3">
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">
                  Client name
                  <input
                    className={fieldCompact}
                    placeholder="Optional"
                    autoComplete="name"
                    value={row.customerName ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => {
                        const next = [...rs];
                        next[idx] = { ...next[idx], customerName: v };
                        return next;
                      });
                    }}
                  />
                </label>
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">
                  Phone
                  <input
                    className={fieldCompact}
                    placeholder="Optional"
                    inputMode="tel"
                    autoComplete="tel"
                    value={row.customerPhone ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => {
                        const next = [...rs];
                        next[idx] = { ...next[idx], customerPhone: v };
                        return next;
                      });
                    }}
                  />
                </label>
                <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">
                  Facebook
                  <input
                    className={fieldCompact}
                    placeholder="Name or profile"
                    value={row.customerFacebook ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => {
                        const next = [...rs];
                        next[idx] = { ...next[idx], customerFacebook: v };
                        return next;
                      });
                    }}
                  />
                </label>
              </div>

              <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-white/35">
                Notes
                <input
                  className={fieldCompact}
                  placeholder="Optional — detail for “Others” or internal note"
                  value={row.notes ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows((rs) => {
                      const next = [...rs];
                      next[idx] = { ...next[idx], notes: v };
                      return next;
                    });
                  }}
                />
              </label>
            </div>
          ))}
        </div>

        <div className="admin-form-sticky flex flex-col gap-3 sm:static sm:mt-0 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <button
            type="button"
            className="min-h-[2.75rem] rounded-full border border-white/15 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70"
            onClick={() => setRows((r) => [...r, newRow()])}
          >
            Add row
          </button>
          <button
            type="submit"
            disabled={pending}
            className="min-h-[2.75rem] rounded-full bg-[var(--admin-accent)] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save services"}
          </button>
        </div>
      </form>
    </div>
  );
}
