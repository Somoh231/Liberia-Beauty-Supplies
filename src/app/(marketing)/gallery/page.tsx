import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import Image from "next/image";

export const metadata: Metadata = { title: "Gallery" };

const shots = [
  { src: "/salon/styling-pink-stations.png", alt: "Pink styling stations with mirrors and salon lighting" },
  { src: "/salon/hero-glam-stations.png", alt: "Salon styling area with glam lighting" },
  { src: "/salon/floor-marble-wide.png", alt: "Marble salon floor and spacious interior" },
  { src: "/salon/wig-wall-display.png", alt: "Wig and hair display wall" },
  { src: "/salon/retail-center-display.png", alt: "Beauty retail display at salon center" },
  { src: "/salon/supplies-shelves-detail.png", alt: "Beauty supplies on shelves" },
  { src: "/salon/showroom-wood-shelves.png", alt: "Wood shelving with beauty products" },
] as const;

export default function GalleryPage() {
  return (
    <section className="border-b border-[var(--line)] bg-[var(--bg)]">
      <Container className="py-14 sm:py-16 lg:py-20">
        <div className="animate-fade-up">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Gallery</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-[var(--fg)] sm:text-4xl">
            Inside the studio
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--fg-muted)] sm:text-base">
            Blush stations, gold accents, marble floors, and curated retail — the same calm luxury you feel when you walk
            through our doors.
          </p>
        </div>

        <div className="mt-12 columns-1 gap-4 sm:columns-2 lg:columns-3 lg:gap-5">
          {shots.map((shot, i) => (
            <div
              key={shot.src}
              className="group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow-md)] animate-fade-up sm:mb-5"
              style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src={shot.src}
                  alt={shot.alt}
                  fill
                  className="object-cover transition duration-700 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.06]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#111]/25 via-transparent to-transparent opacity-0 transition duration-500 group-hover:opacity-100" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
