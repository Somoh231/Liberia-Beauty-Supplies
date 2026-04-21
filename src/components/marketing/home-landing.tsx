import { HardNavLink } from "@/components/marketing/hard-nav-link";
import { STAFF_LOGIN_PATH } from "@/lib/auth/safe-admin-next";
import { Container } from "@/components/ui/container";
import { CONTACT_EMAIL, SITE_NAME, STUDIO_ADDRESS_LINE, STUDIO_HOURS_SHORT } from "@/lib/site";
import Image from "next/image";
import Link from "next/link";

const features = [
  { title: "Online booking", body: "Choose your service, stylist preference, and a time that fits your day." },
  { title: "Salon-grade care", body: "Pink stations, gold accents, and lighting designed for precision and calm." },
  { title: "Beauty supplies", body: "Professional products and guidance to keep your look fresh between visits." },
] as const;

export function HomeLanding() {
  return (
    <div>
      <section className="relative min-h-[min(88vh,840px)] overflow-hidden border-b border-[var(--line)]">
        <Image
          src="/salon/styling-pink-stations.png"
          alt="Liberian Beauty Salon interior with pink styling stations and mirrors"
          fill
          priority
          className="object-cover object-center animate-hero-image"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111]/88 via-[#111]/45 to-[#111]/15" aria-hidden />
        <div
          className="absolute inset-0 bg-gradient-to-br from-[#F7D6E0]/35 via-transparent to-[#D4AF37]/18"
          aria-hidden
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_120%,rgba(212,175,55,0.12),transparent_55%)]" aria-hidden />

        <Container className="relative flex min-h-[min(88vh,840px)] flex-col justify-end pb-14 pt-28 sm:pb-16 sm:pt-32 lg:pb-20 lg:pt-36">
          <div className="max-w-3xl animate-fade-up">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-[#D4AF37]">{STUDIO_ADDRESS_LINE}</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[1.05] tracking-tight text-[#FAF7F2] drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]">
              Luxury Beauty in Monrovia
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              Hair, nails, beauty, and premium care in a space designed for elegance.
            </p>

            <div className="mt-10 flex flex-col gap-3.5 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/book"
                className="inline-flex min-h-[3.1rem] min-w-[11rem] items-center justify-center rounded-full bg-[#D4AF37] px-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_20px_50px_-20px_rgba(212,175,55,0.55)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:brightness-[1.06] active:scale-[0.99] sm:min-h-0"
              >
                Book now
              </Link>
              <Link
                href="/services"
                className="inline-flex min-h-[3.1rem] min-w-[11rem] items-center justify-center rounded-full border border-white/35 bg-white/[0.08] px-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FAF7F2] backdrop-blur-sm transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-[#D4AF37]/55 hover:bg-white/[0.12] active:scale-[0.99] sm:min-h-0"
              >
                View services
              </Link>
            </div>

            <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
              Open · {STUDIO_HOURS_SHORT}
            </p>
            <p className="mt-4 text-xs text-white/55">
              <HardNavLink
                href={STAFF_LOGIN_PATH}
                className="text-[#D4AF37] underline-offset-4 transition hover:underline"
              >
                Staff login
              </HardNavLink>
              <span className="font-normal normal-case tracking-normal text-white/40"> · Internal dashboard</span>
            </p>
            <p className="mt-4 text-sm text-white/50">
              Questions?{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-medium text-[#F7D6E0] underline-offset-[3px] transition hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        </Container>
      </section>

      <section className="relative overflow-hidden border-b border-[var(--line)] bg-[var(--bg)]">
        <div className="pointer-events-none absolute inset-0 opacity-[0.45]" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(-12deg, transparent, transparent 48px, rgba(212,175,55,0.04) 48px, rgba(212,175,55,0.04) 49px),
                repeating-linear-gradient(78deg, transparent, transparent 64px, rgba(247,214,224,0.12) 64px, rgba(247,214,224,0.12) 65px)`,
            }}
          />
        </div>
        <Container className="relative py-16 sm:py-20 lg:py-24">
          <div className="grid items-stretch gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-16">
            <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[var(--accent-deep)]">
                Why clients choose us
              </p>
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--fg)] sm:text-[2.15rem]">
                A beauty studio built for confidence
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
                Marble-inspired floors, warm blush tones, and gold trim set the tone — so every visit feels like a
                reset.
              </p>
              <ul className="mt-10 space-y-6">
                {features.map((f) => (
                  <li key={f.title} className="flex gap-4">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#D4AF37] shadow-[0_0_0_5px_rgba(212,175,55,0.2)]"
                      aria-hidden
                    />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fg)]">{f.title}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-muted)]">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative animate-fade-up" style={{ animationDelay: "140ms" }}>
              <div className="marketing-card relative h-full overflow-hidden p-8 sm:p-10">
                <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[var(--brand-blush)]/50 blur-3xl" aria-hidden />
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--line)] shadow-[var(--shadow-md)]">
                  <Image
                    src="/salon/floor-marble-wide.png"
                    alt="Salon marble floor and retail area"
                    fill
                    className="object-cover transition duration-700 [transition-timing-function:var(--ease-out)] hover:scale-[1.03]"
                    sizes="(max-width: 1024px) 100vw, 400px"
                  />
                </div>
                <p className="relative mt-8 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">
                  {SITE_NAME}
                </p>
                <p className="relative mt-3 font-[family-name:var(--font-display)] text-xl font-medium leading-snug tracking-tight text-[var(--fg)] sm:text-2xl">
                  World-class atmosphere. Monrovia warmth.
                </p>
                <p className="relative mt-4 text-sm leading-relaxed text-[var(--fg-muted)]">
                  Staff scheduling and inventory stay behind a secure sign-in — your booking experience stays effortless
                  on the surface.
                </p>
                <p className="relative mt-6 text-xs text-[var(--fg-subtle)]">
                  Team tools:{" "}
                  <HardNavLink href={STAFF_LOGIN_PATH} className="font-medium text-[var(--accent-deep)] underline-offset-4 hover:underline">
                    {STAFF_LOGIN_PATH}
                  </HardNavLink>
                </p>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
