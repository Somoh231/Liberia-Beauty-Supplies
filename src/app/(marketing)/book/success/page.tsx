import type { Metadata } from "next";
import { getBookingSummaryAction } from "@/app/actions/booking";
import { Container } from "@/components/ui/container";
import { CONTACT_EMAIL, WHATSAPP_E164 } from "@/lib/site";
import Link from "next/link";

export const metadata: Metadata = { title: "Booking confirmed" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function formatWhen(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const datePart = new Intl.DateTimeFormat("en-LR", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(s);
  const tf = new Intl.DateTimeFormat("en-LR", { timeZone: "UTC", hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} · ${tf.format(s)} – ${tf.format(e)} (UTC)`;
}

function buildWhatsappHref(input: { bookingId: string; when: string; service: string; stylist: string }) {
  const phone = WHATSAPP_E164.replace("+", "");
  const text = [
    "Hello Liberian Beauty,",
    "",
    "I just booked an appointment:",
    `• Service: ${input.service}`,
    `• Stylist: ${input.stylist}`,
    `• When: ${input.when}`,
    `• Reference: ${input.bookingId}`,
    "",
    "Please confirm. Thank you.",
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

type Props = { searchParams: Promise<{ booking?: string | string[] }> };

export default async function BookSuccessPage({ searchParams }: Props) {
  const raw = (await searchParams) ?? {};
  const bookingId = firstString(raw.booking);

  if (!bookingId || !UUID_RE.test(bookingId)) {
    return (
      <section className="bg-[var(--bg)]">
        <Container className="py-16 text-center sm:py-20">
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--fg)]">Missing reference</h1>
          <p className="mt-4 text-sm text-[var(--fg-muted)]">Open this page from your confirmation link after booking.</p>
          <Link
            href="/book"
            className="mt-8 inline-flex rounded-full bg-[#D4AF37] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:brightness-[1.06]"
          >
            Start a booking
          </Link>
        </Container>
      </section>
    );
  }

  const result = await getBookingSummaryAction(bookingId);
  if (!result.ok) {
    return (
      <section className="bg-[var(--bg)]">
        <Container className="py-16 text-center sm:py-20">
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--fg)]">We could not find that booking</h1>
          <p className="mt-4 text-sm text-[var(--fg-muted)]">If you just booked, email the studio with your details.</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-8 inline-flex rounded-full bg-[#D4AF37] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:brightness-[1.06]"
          >
            Email studio
          </a>
        </Container>
      </section>
    );
  }

  const { booking } = result;
  const whenLabel = formatWhen(booking.startsAt, booking.endsAt);
  const whatsappHref = buildWhatsappHref({
    bookingId: booking.id,
    when: whenLabel,
    service: booking.serviceName,
    stylist: booking.stylistName,
  });

  return (
    <section className="bg-[var(--bg)]">
      <Container className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,var(--brand-blush))] px-6 py-10 text-center shadow-[var(--shadow-lg)] sm:px-10 sm:py-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Confirmed</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-medium text-[var(--fg)] sm:text-4xl">You are on the books</h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--fg-muted)]">
            Thank you, <span className="font-medium text-[var(--fg)]">{booking.customerName}</span>.
          </p>
          <p className="mt-6 font-[family-name:var(--font-display)] text-xl text-[var(--fg)]">{whenLabel}</p>
          <p className="mt-2 text-xs text-[var(--fg-muted)]">Reference · {booking.id}</p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="inline-flex justify-center rounded-full bg-[#D4AF37] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition hover:brightness-[1.06]"
            >
              Back to home
            </Link>
            <a
              href={whatsappHref}
              className="inline-flex justify-center rounded-full border border-[color-mix(in_srgb,var(--brand-rose)_45%,var(--line-strong))] bg-[var(--bg-elevated)]/90 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fg)] transition hover:border-[#D4AF37]/45"
            >
              Confirm on WhatsApp
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex justify-center rounded-full border border-[var(--line-strong)] bg-transparent px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fg)]/90 transition hover:border-[#D4AF37]/35"
            >
              Email studio
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}

