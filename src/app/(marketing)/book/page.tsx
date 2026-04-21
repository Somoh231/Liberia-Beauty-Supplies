import type { Metadata } from "next";
import { getBookingWizardData } from "@/app/actions/booking";
import { BookingPlaceholderCalendar } from "@/components/booking/booking-placeholder-calendar";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { Container } from "@/components/ui/container";
import { maxBookableDateStrUtc, minBookableDateStrUtc } from "@/lib/booking/availability";

export const metadata: Metadata = {
  title: "Book",
  description: "Reserve a service at Liberian Beauty Salon & Supplies.",
};

export default async function BookPage() {
  const data = await getBookingWizardData();
  const minDate = minBookableDateStrUtc();
  const maxDate = maxBookableDateStrUtc();

  return (
    <section className="relative overflow-hidden bg-[var(--bg)]">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_70%_80%_at_50%_-20%,color-mix(in_srgb,var(--brand-blush)_65%,transparent),transparent)]"
        aria-hidden
      />
      <Container className="relative py-14 sm:py-16 lg:py-20">
        <div className="animate-fade-up">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Book</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--fg)] sm:text-4xl">
            Reserve your chair
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
            Choose your service, optional stylist, date, and time. Your appointment is confirmed once you finish the last
            step.
          </p>
        </div>

        <div className="mt-12 animate-fade-up" style={{ animationDelay: "80ms" }}>
          {!data.ok ? (
            <BookingPlaceholderCalendar />
          ) : (
            <BookingWizard services={data.services} stylists={data.stylists} minDate={minDate} maxDate={maxDate} />
          )}
        </div>
      </Container>
    </section>
  );
}
