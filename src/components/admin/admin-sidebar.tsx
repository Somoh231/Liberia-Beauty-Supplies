"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Globe, LogOut } from "lucide-react";
import { signOutAdmin } from "@/app/actions/admin-auth";
import { BrandLogo } from "@/components/admin/brand-logo";
import { activeNavHref, navItemsForRole } from "@/lib/admin/admin-nav";
import type { AdminPortalRole } from "@/lib/auth/admin-roles";
import { roleBadgeLabel } from "@/lib/auth/admin-roles";
import { cn } from "@/lib/utils";

export function AdminSidebar({
  email,
  fullName,
  roleSlug,
  logoSrc,
  onNavigate,
}: {
  email: string;
  fullName: string | null;
  roleSlug: AdminPortalRole;
  logoSrc?: string | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() || "";
  const items = navItemsForRole(roleSlug);
  const activeHref = activeNavHref(pathname);
  const initials = (fullName || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col bg-[var(--admin-surface)]">
      {/* Logo */}
      <div className="flex shrink-0 items-center px-6 py-6">
        <Link href="/admin" onClick={onNavigate} aria-label="Liberian Beauty — Dashboard">
          <BrandLogo src={logoSrc} />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="admin-x-scroll flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Primary">
        {items.map((item) => {
          const active = activeHref === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn("admin-nav-item", active && "admin-nav-item-active")}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <Link href="/" onClick={onNavigate} className="admin-nav-item" target="_blank" rel="noreferrer">
          <Globe className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="truncate">Website</span>
        </Link>
      </nav>

      {/* Owner profile + logout */}
      <div className="shrink-0 border-t border-[var(--admin-border)] p-3">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--admin-pink)]/15 text-sm font-semibold text-[var(--admin-pink)] ring-1 ring-[var(--admin-pink)]/25">
            {initials}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-[var(--admin-fg)]">{fullName || email}</span>
            <span className="block truncate text-[11px] uppercase tracking-[0.14em] text-[var(--admin-fg-muted)]">
              {roleBadgeLabel(roleSlug)}
            </span>
          </span>
        </div>
        <form action={signOutAdmin} className="mt-1">
          <button type="submit" className="admin-nav-item w-full text-left">
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="truncate">Logout</span>
          </button>
        </form>
      </div>
    </div>
  );
}
