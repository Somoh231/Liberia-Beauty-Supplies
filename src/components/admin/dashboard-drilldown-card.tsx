import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Accessible dashboard KPI card link — single anchor, no nested controls.
 */
export function DashboardDrilldownCard({
  href,
  label,
  children,
  className,
}: {
  href: string;
  /** Accessible name describing the destination. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "admin-card admin-card-interactive block p-6 outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-accent)]",
        className,
      )}
    >
      {children}
      <span className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)]/80">
        View details →
      </span>
    </Link>
  );
}
