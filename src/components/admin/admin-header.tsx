"use client";

import { usePathname } from "next/navigation";
import { Bell, ChevronRight, Menu, Search } from "lucide-react";
import { resolvePageMeta } from "@/lib/admin/admin-nav";
import { roleBadgeLabel } from "@/lib/auth/admin-roles";
import type { AdminPortalRole } from "@/lib/auth/admin-roles";
import { Fragment } from "react";

export function AdminHeader({
  email,
  fullName,
  roleSlug,
  onOpenMenu,
}: {
  email: string;
  fullName: string | null;
  roleSlug: AdminPortalRole;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname() || "";
  const { title, crumbs } = resolvePageMeta(pathname);
  const initials = (fullName || email || "?").trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--admin-border)] bg-[var(--admin-surface)]/85 backdrop-blur-xl">
      <div className="flex h-20 items-center gap-4 px-5 sm:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          className="admin-icon-btn lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <nav className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--admin-fg-muted)]" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <Fragment key={`${c}-${i}`}>
                {i > 0 ? <ChevronRight className="h-3 w-3 opacity-50" aria-hidden /> : null}
                <span className={i === crumbs.length - 1 ? "text-[var(--admin-fg)]/80" : ""}>{c}</span>
              </Fragment>
            ))}
          </nav>
          <h1 className="mt-0.5 truncate font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight text-[var(--admin-fg)]">
            {title}
          </h1>
        </div>

        {/* Search (presentational) */}
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-fg-muted)]" aria-hidden />
          <input
            type="search"
            placeholder="Search…"
            aria-label="Search"
            className="h-10 w-56 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-elevated)] pl-9 pr-3 text-sm text-[var(--admin-fg)] placeholder:text-[var(--admin-fg-muted)] focus:border-[var(--admin-pink)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-pink)]/30"
          />
        </div>

        <button type="button" className="admin-icon-btn relative" aria-label="Notifications">
          <Bell className="h-5 w-5" aria-hidden />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--admin-pink)]" aria-hidden />
        </button>

        <div className="flex items-center gap-2.5 rounded-full border border-[var(--admin-border)] bg-[var(--admin-elevated)] py-1 pl-1 pr-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--admin-pink)]/15 text-xs font-semibold text-[var(--admin-pink)]">
            {initials}
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block max-w-[140px] truncate text-xs font-medium text-[var(--admin-fg)]">{fullName || email}</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-[var(--admin-fg-muted)]">{roleBadgeLabel(roleSlug)}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
