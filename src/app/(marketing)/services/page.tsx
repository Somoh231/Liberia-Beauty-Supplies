import type { Metadata } from "next";
import { ServiceCategoryIcon } from "@/components/marketing/service-category-icons";
import { Container } from "@/components/ui/container";
import Link from "next/link";

export const metadata: Metadata = { title: "Services" };

const services = [
  {
    icon: "hair" as const,
    name: "Hair styling",
    detail: "Cuts, blowouts, silk presses, and polished finishes tailored to your texture and goals.",
  },
  {
    icon: "braid" as const,
    name: "Braiding",
    detail: "Knotless, box braids, twists, and cornrows with clean parts and long-lasting neatness.",
  },
  {
    icon: "nails" as const,
    name: "Nails",
    detail: "Manicures and enhancements with careful prep and refined shaping.",
  },
  {
    icon: "makeup" as const,
    name: "Makeup",
    detail: "Soft glam, events, and camera-ready looks with a light, skin-first approach.",
  },
  {
    icon: "pedi" as const,
    name: "Pedicure / manicure",
    detail: "Spa pedis and detailed nail care in a relaxed, immaculate setting.",
  },
  {
    icon: "wig" as const,
    name: "Wig installation",
    detail: "Custom fit, natural hairlines, and secure installs for everyday wear or special occasions.",
  },
  {
    icon: "supplies" as const,
    name: "Beauty supplies",
    detail: "Professional-grade products and honest recommendations for home maintenance.",
  },
] as const;

export default function ServicesPage() {
  return (
    <section className="border-b border-[var(--line)] bg-[var(--bg)]">
      <Container className="py-14 sm:py-16 lg:py-20">
        <div className="animate-fade-up">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Services</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--fg)] sm:text-4xl">
            Signature treatments
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
            Book online in minutes. Not sure what to choose? Leave a note — we will guide you before your appointment.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => (
            <div
              key={s.name}
              className="marketing-card group border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 sm:p-7 animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[#D4AF37] transition duration-200 group-hover:scale-105 group-hover:shadow-[0_8px_24px_-12px_rgba(212,175,55,0.35)]">
                <ServiceCategoryIcon kind={s.icon} />
              </div>
              <p className="mt-5 font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--fg)]">{s.name}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">{s.detail}</p>
              <Link
                href="/book"
                className="mt-6 inline-flex text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-deep)] underline-offset-4 transition hover:text-[#D4AF37] hover:underline"
              >
                Book →
              </Link>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
