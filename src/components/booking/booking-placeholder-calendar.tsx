"use client";

import { useMemo, useState } from "react";

const SLOTS = ["9:00 AM", "11:00 AM", "1:00 PM", "3:00 PM", "5:00 PM"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toIsoLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Weekday sample “open” days in the visible month (from today if current month). */
function availableDatesInMonth(year: number, monthIndex: number, today: Date): Set<string> {
  const set = new Set<string>();
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let day = new Date(Math.max(monthStart.getTime(), today0.getTime()));
  if (day > monthEnd) return set;
  while (day <= monthEnd && set.size < 14) {
    const wd = day.getDay();
    if (wd !== 0 && wd !== 1) set.add(toIsoLocal(day));
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    day = next;
  }
  return set;
}

function monthMatrix(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: { day: number | null; iso: string | null }[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad2(monthIndex + 1)}-${pad2(d)}`;
    cells.push({ day: d, iso });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
  return cells;
}

const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

export function BookingPlaceholderCalendar() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const available = useMemo(() => availableDatesInMonth(cursor.y, cursor.m, today), [cursor.y, cursor.m, today]);

  const matrix = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor.y, cursor.m]);

  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(cursor.y, cursor.m, 1));

  const goPrev = () => {
    setCursor((c) => {
      const d = new Date(c.y, c.m - 1, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    setSelectedIso(null);
    setSlot(null);
  };

  const goNext = () => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + 1, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    setSelectedIso(null);
    setSlot(null);
  };

  const [pending, setPending] = useState(false);

  const onRequest = () => {
    if (!selectedIso || !slot) return;
    setPending(true);
    window.setTimeout(() => {
      setPending(false);
      setSubmitted(true);
    }, 380);
  };

  const canSubmit = Boolean(selectedIso && slot && !pending && !submitted);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="marketing-card p-6 sm:p-8 lg:p-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Preview schedule</p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[var(--fg)] sm:text-3xl">
          Choose a date &amp; time
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--fg-muted)]">
          Sample availability for this month — select a highlighted day, then a time. Live booking integration is coming
          next phase.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
              <button
                type="button"
                onClick={goPrev}
                className="min-h-[2.75rem] rounded-full border border-[var(--line-strong)] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-[var(--accent)]/40 hover:bg-[var(--fg)]/[0.03] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:scale-[0.98] sm:min-h-0"
                aria-label="Previous month"
              >
                ← Prev
              </button>
              <p className="min-w-0 truncate px-2 text-center font-[family-name:var(--font-display)] text-base font-medium text-[var(--fg)] sm:text-lg">
                {label}
              </p>
              <button
                type="button"
                onClick={goNext}
                className="min-h-[2.75rem] rounded-full border border-[var(--line-strong)] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-[var(--accent)]/40 hover:bg-[var(--fg)]/[0.03] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:scale-[0.98] sm:min-h-0"
                aria-label="Next month"
              >
                Next →
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--fg-muted)]">
              {WEEK.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
              {matrix.map((cell, i) => {
                if (cell.day == null || cell.iso == null) {
                  return <div key={`e-${i}`} className="aspect-square min-h-[2.75rem] sm:min-h-0" aria-hidden />;
                }
                const isAvail = available.has(cell.iso);
                const isSelected = selectedIso === cell.iso;
                const isToday = cell.iso === toIsoLocal(today);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={!isAvail}
                    onClick={() => {
                      setSelectedIso(cell.iso);
                      setSlot(null);
                    }}
                    className={`flex min-h-[2.75rem] min-w-0 items-center justify-center rounded-xl text-sm font-medium transition duration-200 [transition-timing-function:var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] sm:aspect-square sm:min-h-0 ${
                      isSelected
                        ? "bg-[#D4AF37] text-[#111111] shadow-[var(--shadow-md)] ring-2 ring-[#D4AF37]/50"
                        : isAvail
                          ? "border border-[var(--line)] bg-[var(--bg-elevated)]/90 text-[var(--fg)] hover:border-[#D4AF37]/45 hover:shadow-[var(--shadow-sm)] active:scale-[0.97]"
                          : "cursor-not-allowed border border-transparent text-[var(--fg-subtle)] opacity-40"
                    } ${isToday && !isSelected ? "ring-1 ring-[#D4AF37]/35" : ""}`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-[var(--fg-subtle)]">
              Ringed day is today. Selectable weekdays are sample availability for this preview.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-subtle)]/40 p-5 sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-deep)]">Times</p>
            <div className="mt-4 flex flex-col gap-2">
              {SLOTS.map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!selectedIso}
                  onClick={() => setSlot(t)}
                  className={`min-h-[3rem] rounded-xl border px-4 text-left text-sm font-medium transition duration-200 [transition-timing-function:var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:min-h-[2.75rem] ${
                    slot === t
                      ? "border-[var(--accent)]/50 bg-[var(--accent-soft)] text-[var(--fg)] shadow-[var(--shadow-sm)]"
                      : "border-[var(--line)] bg-[var(--bg-elevated)]/90 text-[var(--fg-muted)] hover:border-[var(--accent)]/35 hover:text-[var(--fg)] active:scale-[0.99]"
                  } disabled:pointer-events-none disabled:opacity-35`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="marketing-card p-6 sm:p-8 lg:p-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Your details</p>
        <h3 className="mt-2 font-[family-name:var(--font-display)] text-xl font-medium text-[var(--fg)]">Request appointment</h3>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="mt-2 min-h-[48px] w-full rounded-xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-4 text-[var(--fg)] outline-none transition focus:border-[var(--accent)]/55 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="mt-2 min-h-[48px] w-full rounded-xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-4 text-[var(--fg)] outline-none transition focus:border-[var(--accent)]/55 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              type="email"
              className="mt-2 min-h-[48px] w-full rounded-xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-4 text-[var(--fg)] outline-none transition focus:border-[var(--accent)]/55 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-2 w-full resize-y rounded-xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--fg)] outline-none transition focus:border-[var(--accent)]/55 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/25"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={onRequest}
          disabled={!canSubmit}
          aria-busy={pending}
          className="mt-8 min-h-[3rem] w-full rounded-full bg-[#D4AF37] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_36px_-16px_rgba(212,175,55,0.45)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:brightness-[1.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[14rem]"
        >
          {pending ? "Sending…" : submitted ? "Request received" : "Request appointment"}
        </button>

        {!submitted && (!selectedIso || !slot) ? (
          <p className="mt-3 text-center text-[11px] text-[var(--fg-subtle)]">Select a date and time to enable the request button.</p>
        ) : null}

        {submitted ? (
          <p className="mt-5 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-deep)]" role="status">
            Thanks — this is a preview only. Live booking integration is coming next phase; we&apos;ll confirm by phone or
            WhatsApp until then.
          </p>
        ) : null}

        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--fg-subtle)]">
          Live booking integration coming next phase.
        </p>
      </div>
    </div>
  );
}
