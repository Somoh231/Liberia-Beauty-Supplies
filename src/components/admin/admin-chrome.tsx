"use client";

import { signOutAdmin } from "@/app/actions/admin-auth";
import type { AdminPortalRole } from "@/lib/auth/admin-roles";
import { isSalonStaffRole } from "@/lib/auth/admin-roles";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const allNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/sales/new", label: "Sale" },
  { href: "/admin/services/new", label: "Service" },
  { href: "/admin/sales-log", label: "Sale Log" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/suppliers", label: "Suppliers" },
] as const;

function navForRole(role: AdminPortalRole) {
  if (isSalonStaffRole(role)) return allNav.filter((i) => i.href !== "/admin/suppliers");
  return [...allNav];
}

function navActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminChrome({ email, roleSlug }: { email: string; roleSlug: AdminPortalRole }) {
  const pathname = usePathname() || "";
  const nav = navForRole(roleSlug);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--admin-line)] bg-[#060607]/72 text-[var(--admin-fg)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-[#060607]/55 print:hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--admin-accent)]/35 to-transparent"
        aria-hidden
      />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10 xl:max-w-7xl">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="font-[family-name:var(--font-display)] text-[1.35rem] font-medium tracking-tight text-white transition duration-200 [transition-timing-function:var(--ease-out)] hover:text-[var(--admin-accent)]"
          >
            Salon
          </Link>
          <span className="hidden h-7 w-px bg-gradient-to-b from-transparent via-[var(--admin-line)] to-transparent sm:block" aria-hidden />
          <div className="hidden min-w-0 text-xs sm:block">
            <span className="block truncate text-[var(--admin-fg)]/78">{email}</span>
            <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-accent)]">
              {roleSlug}
            </span>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2" aria-label="Admin">
          {nav.map((item) => {
            const active = navActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-fg-muted)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:bg-white/[0.06] hover:text-[var(--admin-fg)] active:scale-[0.98]",
                  active && "bg-white/[0.09] text-[var(--admin-fg)] ring-1 ring-[var(--admin-line-bright)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/"
            className="rounded-full px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-fg-muted)] transition duration-200 hover:bg-white/[0.06] hover:text-[var(--admin-fg)] active:scale-[0.98]"
          >
            Website
          </Link>
          <form action={signOutAdmin} className="ml-0.5 inline sm:ml-1">
            <button
              type="submit"
              className="rounded-full border border-[var(--admin-accent)]/40 bg-[var(--admin-accent-dim)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-[var(--admin-accent)]/55 hover:bg-[var(--admin-accent)]/18 active:scale-[0.98]"
            >
              Sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
