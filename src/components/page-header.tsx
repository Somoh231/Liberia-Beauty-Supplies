import { Container } from "@/components/ui/container";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--line)]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[var(--wash)]/50 via-[var(--bg)] to-[var(--bg)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-[var(--accent-soft)] blur-3xl"
        aria-hidden
      />
      <Container className="relative py-14 sm:py-16 lg:py-20">
        <div className="max-w-3xl animate-fade-up">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--accent-deep)]">{eyebrow}</p>
          )}
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-medium leading-[1.08] tracking-tight text-[var(--fg)] sm:text-5xl lg:text-[3.15rem]">
            {title}
          </h1>
          {description && (
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--fg-muted)] sm:text-lg">{description}</p>
          )}
          {children}
        </div>
      </Container>
    </section>
  );
}
