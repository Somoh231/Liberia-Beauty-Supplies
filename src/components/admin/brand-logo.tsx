import Image from "next/image";
import { Crown } from "lucide-react";

/**
 * Brand logo for the admin shell.
 *
 * When the real asset exists at `public/brand/liberia-beauty-logo.png`, the layout
 * passes `src` and we render it exactly (no recreation). Until then, a restrained
 * crown + wordmark lockup stands in so the shell renders cleanly.
 */
export function BrandLogo({ src, className }: { src?: string | null; className?: string }) {
  if (src) {
    return (
      <div className={className}>
        <Image
          src={src}
          alt="Liberian Beauty Salon & Supplies"
          width={384}
          height={307}
          priority
          className="h-auto w-[180px] object-contain"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--admin-pink)]/12 text-[var(--admin-gold)] ring-1 ring-[var(--admin-pink)]/25">
        <Crown className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-pink)]">
          Liberia
        </span>
        <span className="block font-[family-name:var(--font-display)] text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-gold)]">
          Beauty
        </span>
      </span>
    </div>
  );
}
