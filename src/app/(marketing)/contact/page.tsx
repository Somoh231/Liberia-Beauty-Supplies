import type { Metadata } from "next";
import { ContactInquiryForm } from "@/components/marketing/contact-inquiry-form";
import { Container } from "@/components/ui/container";
import {
  CONTACT_EMAIL,
  GOOGLE_MAPS_PLACEHOLDER_HREF,
  STUDIO_ADDRESS_LINE,
  STUDIO_PHONE_DISPLAY,
  WHATSAPP_E164,
} from "@/lib/site";
import Image from "next/image";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  const wa = `https://wa.me/${WHATSAPP_E164.replace("+", "")}`;
  return (
    <section className="border-b border-[var(--line)] bg-[var(--bg)]">
      <Container className="py-14 sm:py-16 lg:py-20">
        <div className="animate-fade-up">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Contact</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--fg)] sm:text-4xl">
            We would love to hear from you
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
            WhatsApp is fastest for quick questions. For detailed requests, send a note — we reply during studio hours.
          </p>
        </div>

        <a
          href={wa}
          className="mt-10 flex min-h-[3.5rem] w-full items-center justify-center gap-2 rounded-2xl border border-[color-mix(in_srgb,#D4AF37_40%,var(--line))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand-blush)_55%,#fff)_0%,var(--bg-elevated)_100%)] px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fg)] shadow-[var(--shadow-md)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-[#D4AF37]/55 hover:shadow-[var(--shadow-float)] sm:w-auto sm:min-w-[16rem] animate-fade-up"
          style={{ animationDelay: "60ms" }}
        >
          <span className="text-[#D4AF37]" aria-hidden>
            ●
          </span>
          Chat on WhatsApp
        </a>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-12">
          <ContactInquiryForm />

          <div className="space-y-6">
            <div
              className="marketing-card overflow-hidden border border-[var(--line)] bg-[var(--bg-elevated)]/95 animate-fade-up"
              style={{ animationDelay: "80ms" }}
            >
              <div className="relative aspect-[16/10] w-full border-b border-[var(--line)]">
                <Image
                  src="/salon/floor-marble-wide.png"
                  alt="Salon interior with marble floors — decorative map card background"
                  fill
                  className="object-cover object-center opacity-90"
                  sizes="(max-width: 1024px) 100vw, 380px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111]/75 via-[#111]/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">Visit</p>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-xl text-[#FAF7F2]">{STUDIO_ADDRESS_LINE}</p>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">
                    Map preview — tap through for live directions once your pin is finalized in Google Maps.
                  </p>
                  <a
                    href={GOOGLE_MAPS_PLACEHOLDER_HREF}
                    className="mt-4 inline-flex rounded-full bg-[#D4AF37] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#111111] shadow-lg transition hover:brightness-[1.06]"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <a
                href={wa}
                className="marketing-card border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 transition hover:border-[#D4AF37]/35"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">WhatsApp</p>
                <p className="mt-3 text-sm text-[var(--fg-muted)]">{STUDIO_PHONE_DISPLAY}</p>
              </a>
              <a href={`tel:${WHATSAPP_E164}`} className="marketing-card border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 transition hover:border-[#D4AF37]/35">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Call</p>
                <p className="mt-3 text-sm text-[var(--fg-muted)]">{STUDIO_PHONE_DISPLAY}</p>
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="marketing-card border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 transition hover:border-[#D4AF37]/35 sm:col-span-2"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Email</p>
                <p className="mt-3 text-sm text-[var(--fg-muted)]">{CONTACT_EMAIL}</p>
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
