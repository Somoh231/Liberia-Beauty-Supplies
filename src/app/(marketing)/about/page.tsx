import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { SITE_NAME, STUDIO_ADDRESS_LINE, STUDIO_HOURS_LONG } from "@/lib/site";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <section className="border-b border-[var(--line)] bg-[var(--bg)]">
      <Container className="py-14 sm:py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-16">
          <div className="animate-fade-up">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">About</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--fg)] sm:text-4xl">
              {SITE_NAME}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
              Liberia Beauty Salon and Supplies is Liberia&apos;s first space-for-lease salon — a modern, purpose-built environment designed to give talented young
              Liberian beauty technicians and hair stylists the platform they deserve.
            </p>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
              Our mission is simple: to take skilled professionals off the streets and out of undesirable working conditions, and bring them into a clean, safe, and
              fully professional workspace where their talent can truly flourish.
            </p>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
              Each stylist operates fully independently — managing their own clients, setting their own schedule, and building their own business — all within a
              modern, well-equipped salon that reflects the excellence of their craft.
            </p>
            <Link
              href="/book"
              className="mt-10 inline-flex min-h-[3rem] items-center justify-center rounded-full bg-[#D4AF37] px-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_18px_44px_-18px_rgba(212,175,55,0.45)] transition hover:brightness-[1.06] sm:min-h-0"
            >
              Book a visit
            </Link>
          </div>

          <div className="relative animate-fade-up" style={{ animationDelay: "100ms" }}>
            <div className="marketing-card overflow-hidden border border-[var(--line)] p-2 sm:p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
                <Image
                  src="/salon/hero-glam-stations.png"
                  alt="Salon interior with glam lighting and styling stations"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 420px"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-3">
          <div className="marketing-card border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 animate-fade-up">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Location</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">{STUDIO_ADDRESS_LINE}</p>
          </div>
          <div className="marketing-card border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Hours</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">{STUDIO_HOURS_LONG}</p>
          </div>
          <div className="marketing-card border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 animate-fade-up" style={{ animationDelay: "120ms" }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Booking</p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">
              Book online anytime. Questions? Message us on WhatsApp — we will help you choose the right service.
            </p>
            <Link
              href="/book"
              className="mt-4 inline-flex text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-deep)] underline-offset-4 transition hover:text-[#D4AF37] hover:underline"
            >
              Book →
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
