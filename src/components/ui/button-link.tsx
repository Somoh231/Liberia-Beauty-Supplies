import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex min-h-[2.75rem] items-center justify-center px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-[transform,box-shadow,background-color,border-color,color,filter] duration-200 [transition-timing-function:var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] active:scale-[0.98] sm:min-h-0";

const variants: Record<Variant, string> = {
  primary:
    "rounded-full bg-[#D4AF37] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_36px_-16px_rgba(212,175,55,0.45)] hover:brightness-[1.06] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_18px_44px_-14px_rgba(212,175,55,0.5)]",
  secondary:
    "rounded-full border border-[color-mix(in_srgb,var(--brand-rose)_55%,var(--line))] bg-[var(--bg-elevated)]/90 text-[var(--fg)] shadow-[var(--shadow-sm)] hover:border-[#D4AF37]/45 hover:bg-[var(--wash)]/80",
  ghost:
    "rounded-full border border-[var(--line-strong)] bg-transparent text-[var(--fg)]/90 hover:border-[#D4AF37]/35 hover:bg-[var(--accent-soft)]/40",
};

export function ButtonLink({
  href,
  className,
  variant = "primary",
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link href={href} className={cn(base, variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
