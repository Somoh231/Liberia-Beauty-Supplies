"use client";

import {
  createBookingAction,
  getAvailableSlotsAction,
} from "@/app/actions/booking";
import { BOOKING_TIMEZONE_LABEL } from "@/lib/booking/constants";
import { formatSlotLabel } from "@/lib/booking/availability";
import { CONTACT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";
import type { ServiceDTO, SlotDTO, StylistDTO } from "@/lib/booking/types";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const steps = ["Service", "Stylist", "Date", "Time", "Your details"] as const;

const btnPrimary =
  "inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-full bg-[#D4AF37] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_36px_-16px_rgba(212,175,55,0.45)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:brightness-[1.06] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] disabled:opacity-45 sm:w-auto sm:min-h-0";

const btnGhost =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-deep)] underline-offset-4 transition hover:text-[#D4AF37] hover:underline";

function formatMoney(cents: number | null): string | null {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-LR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-LR", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function stylistsForService(serviceId: string, stylists: StylistDTO[]): StylistDTO[] {
  return stylists.filter((s) => s.serviceIds.includes(serviceId));
}

export function BookingWizard({
  services,
  stylists,
  minDate,
  maxDate,
}: {
  services: ServiceDTO[];
  stylists: StylistDTO[];
  minDate: string;
  maxDate: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [stylistId, setStylistId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState("");
  const [slots, setSlots] = useState<SlotDTO[]>([]);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [slotError, setSlotError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchingSlots, setFetchingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );

  const filteredStylists = useMemo(
    () => (serviceId ? stylistsForService(serviceId, stylists) : []),
    [serviceId, stylists],
  );

  const goNext = () => {
    setSubmitError(null);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const goBack = () => {
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const onContinueFromStylist = () => {
    setSlotError(null);
    setDateStr("");
    setSlots([]);
    setStartsAt(null);
    goNext();
  };

  const onContinueFromDate = async () => {
    if (!serviceId || !dateStr) return;
    setSlotError(null);
    setFetchingSlots(true);
    const res = await getAvailableSlotsAction({
      serviceId,
      stylistId,
      dateStr,
    });
    setFetchingSlots(false);
    if (!res.ok) {
      setSlots([]);
      setStartsAt(null);
      setSlotError(
        res.error === "invalid_date"
          ? "Choose a valid date within the booking window."
          : "Could not load availability. Try another date.",
      );
      return;
    }
    setSlots(res.slots);
    setStartsAt(null);
    if (res.slots.length === 0) {
      setSlotError("No open chairs for that day — try another date or stylist.");
      return;
    }
    goNext();
  };

  const submit = async () => {
    setSubmitError(null);
    if (!serviceId || !dateStr || !startsAt || !service) {
      setSubmitError("Please complete every step.");
      return;
    }
    setSubmitting(true);
    const res = await createBookingAction({
      serviceId,
      stylistId,
      dateStr,
      startsAt,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      notes,
    });
    setSubmitting(false);
    if (!res.ok) {
      const map: Record<typeof res.error, string> = {
        missing_env: "Booking is not configured yet.",
        invalid_input: "Check your details and time selection.",
        slot_unavailable: "Someone just took that slot — pick another time.",
        stylist_invalid: "That stylist cannot take this service.",
        unknown: "Something went wrong. Please try again.",
      };
      setSubmitError(map[res.error]);
      return;
    }
    router.push(`/book/success?booking=${res.bookingId}`);
  };

  return (
    <div
      className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-elevated)_96%,var(--brand-blush))] shadow-[var(--shadow-lg)]"
      aria-busy={submitting || fetchingSlots ? true : undefined}
    >
      <div className="border-b border-[var(--line)] px-4 py-5 sm:px-8 sm:py-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
          Step {step + 1} of {steps.length}
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-medium text-[var(--fg)] sm:text-3xl">
          {steps[step]}
        </h2>
        <ol className="mt-6 flex gap-1.5" aria-label="Progress">
          {steps.map((_, i) => (
            <li
              key={steps[i]}
              className={cn(
                "h-1 flex-1 rounded-full transition",
                i <= step ? "bg-[var(--accent)]" : "bg-[var(--line)]",
              )}
              aria-current={i === step ? "step" : undefined}
            />
          ))}
        </ol>
      </div>

      <div className="px-4 py-8 sm:px-8 sm:py-10">
        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--fg-muted)]">
              Choose the treatment you are booking — duration sets your chair time.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {services.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={serviceId === s.id}
                    onClick={() => {
                      setServiceId(s.id);
                      setStylistId(null);
                    }}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition",
                      serviceId === s.id
                        ? "border-[var(--accent-deep)] bg-[var(--wash)]/80 ring-1 ring-[var(--accent)]/35"
                        : "border-[var(--line)] hover:border-[var(--fg)]/20",
                    )}
                  >
                    <span className="font-[family-name:var(--font-display)] text-lg text-[var(--fg)]">
                      {s.name}
                    </span>
                    {s.description && (
                      <span className="mt-1 block text-xs leading-relaxed text-[var(--fg-muted)]">
                        {s.description}
                      </span>
                    )}
                    <span className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-deep)]">
                      <span>{s.durationMinutes} min</span>
                      {formatMoney(s.priceCents) && (
                        <span className="text-[var(--fg-muted)]">· from {formatMoney(s.priceCents)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
              <button type="button" className={btnPrimary} disabled={!serviceId} onClick={goNext}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 1 && service && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--fg-muted)]">
              Prefer someone specific, or let us assign the first available specialist.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={stylistId === null}
                onClick={() => setStylistId(null)}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  stylistId === null
                    ? "border-[var(--accent-deep)] bg-[var(--wash)]/80 ring-1 ring-[var(--accent)]/35"
                    : "border-[var(--line)] hover:border-[var(--fg)]/20",
                )}
              >
                <span className="font-[family-name:var(--font-display)] text-lg text-[var(--fg)]">
                  No preference
                </span>
                <span className="mt-1 block text-xs text-[var(--fg-muted)]">
                  Fastest match from the team qualified for {service.name}.
                </span>
              </button>
              {filteredStylists.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={stylistId === st.id}
                  onClick={() => setStylistId(st.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition",
                    stylistId === st.id
                      ? "border-[var(--accent-deep)] bg-[var(--wash)]/80 ring-1 ring-[var(--accent)]/35"
                      : "border-[var(--line)] hover:border-[var(--fg)]/20",
                  )}
                >
                  <span className="font-[family-name:var(--font-display)] text-lg text-[var(--fg)]">
                    {st.name}
                  </span>
                  {st.title && (
                    <span className="mt-1 block text-xs text-[var(--fg-muted)]">{st.title}</span>
                  )}
                </button>
              ))}
            </div>
            {filteredStylists.length === 0 && (
              <p className="text-sm text-[var(--accent-deep)]">
                No stylists are mapped to this service yet. Pick another service or call the studio.
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between">
              <button type="button" className={btnGhost} onClick={goBack}>
                Back
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={filteredStylists.length === 0}
                onClick={onContinueFromStylist}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && service && (
          <div className="mx-auto max-w-md space-y-4">
            <p className="text-sm text-[var(--fg-muted)]">
              Select a day — we are open 9:00–18:00 ({BOOKING_TIMEZONE_LABEL}).
            </p>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-deep)]">
                Date
              </span>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={dateStr}
                onChange={(e) => {
                  setDateStr(e.target.value);
                  setSlotError(null);
                }}
                className="mt-2 w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-sm text-[var(--fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] focus:border-[#D4AF37]/55 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/22"
              />
            </label>
            {slotError && (
              <p
                role="alert"
                className="rounded-xl border border-[var(--accent-deep)]/25 bg-[var(--wash)] px-3 py-2 text-sm text-[var(--accent-deep)]"
              >
                {slotError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between">
              <button type="button" className={btnGhost} onClick={goBack}>
                Back
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={!dateStr || fetchingSlots}
                onClick={() => void onContinueFromDate()}
              >
                {fetchingSlots ? "Checking…" : "Continue"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && service && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--fg-muted)]">
              {dateStr && (
                <>
                  <span className="text-[var(--fg)]">{formatLongDate(`${dateStr}T12:00:00.000Z`)}</span>
                  {" · "}
                </>
              )}
              {service.name}
              {stylistId ? (
                <>
                  {" · "}
                  {filteredStylists.find((s) => s.id === stylistId)?.name}
                </>
              ) : (
                <> · Any available stylist</>
              )}
            </p>
            {slotError && (
              <p
                role="alert"
                className="rounded-xl border border-[var(--accent-deep)]/25 bg-[var(--wash)] px-3 py-2 text-sm text-[var(--accent-deep)]"
              >
                {slotError}
              </p>
            )}
            {slots.length > 0 ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {slots.map((sl) => (
                  <li key={sl.startsAt}>
                    <button
                      type="button"
                      aria-pressed={startsAt === sl.startsAt}
                      onClick={() => setStartsAt(sl.startsAt)}
                      className={cn(
                        "w-full rounded-xl border py-3 text-sm transition",
                        startsAt === sl.startsAt
                          ? "border-[var(--accent-deep)] bg-[var(--wash)] ring-1 ring-[var(--accent)]/35"
                          : "border-[var(--line)] hover:border-[var(--fg)]/20",
                      )}
                    >
                      {sl.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              !slotError && (
                <p className="text-sm text-[var(--fg-muted)]">No times loaded — go back and pick a date again.</p>
              )
            )}
            <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-between">
              <button type="button" className={btnGhost} onClick={goBack}>
                Back
              </button>
              <button type="button" className={btnPrimary} disabled={!startsAt} onClick={goNext}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 4 && service && startsAt && (
          <div className="mx-auto max-w-lg space-y-5">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--wash)]/55 p-5 text-sm text-[var(--fg-muted)] shadow-[var(--shadow-sm)]">
              <p className="font-[family-name:var(--font-display)] text-lg text-[var(--fg)]">{service.name}</p>
              <p className="mt-1">
                {formatLongDate(startsAt)} · {formatSlotLabel(startsAt)} –{" "}
                {formatSlotLabel(new Date(new Date(startsAt).getTime() + service.durationMinutes * 60_000).toISOString())}{" "}
                ({BOOKING_TIMEZONE_LABEL})
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-deep)]">
                  Full name
                </span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="mt-2 w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] focus:border-[#D4AF37]/55 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/22"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-deep)]">
                  Phone
                </span>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  className="mt-2 w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] focus:border-[#D4AF37]/55 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/22"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-deep)]">
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-2 w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] focus:border-[#D4AF37]/55 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/22"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-deep)]">
                  Notes <span className="font-normal text-[var(--fg-muted)]">(optional)</span>
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Allergies, inspiration photos, parking needs…"
                  className="mt-2 w-full resize-y rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-3 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] focus:border-[#D4AF37]/55 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/22"
                />
              </label>
            </div>
            {submitError && (
              <p
                role="alert"
                className="rounded-xl border border-[var(--accent-deep)]/25 bg-[var(--wash)] px-3 py-2 text-sm text-[var(--accent-deep)]"
              >
                {submitError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
              <button type="button" className={btnGhost} onClick={goBack} disabled={submitting}>
                Back
              </button>
              <button
                type="button"
                className={btnPrimary}
                disabled={
                  submitting || name.trim().length < 2 || phone.trim().length < 5 || !email.includes("@")
                }
                aria-busy={submitting}
                onClick={() => void submit()}
              >
                {submitting ? "Booking…" : "Confirm booking"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line)] px-4 py-4 sm:px-8">
        <p className="text-center text-[11px] text-[var(--fg-muted)]">
          Questions?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent-deep)] underline-offset-4 hover:underline">
            Email the studio
          </a>
        </p>
      </div>
    </div>
  );
}

export function BookingEnvMissing() {
  return (
    <div className="marketing-card p-8 text-center sm:p-10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
        Setup required
      </p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl text-[var(--fg)]">
        Connect your database
      </h2>
      <p className="mt-4 text-sm leading-relaxed text-[var(--fg-muted)]">
        Add <code className="rounded bg-[var(--wash)] px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-[var(--wash)] px-1.5 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> to{" "}
        <code className="rounded bg-[var(--wash)] px-1.5 py-0.5 text-xs">.env.local</code>, run the SQL migration in
        Supabase, then restart the dev server.
      </p>
    </div>
  );
}
