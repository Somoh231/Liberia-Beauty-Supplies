"use client";

import { HardNavLink } from "@/components/marketing/hard-nav-link";
import { STAFF_LOGIN_PATH } from "@/lib/auth/safe-admin-next";
import { SITE_NAME, SITE_NAME_LINE, SITE_TAGLINE, STUDIO_ADDRESS_LINE } from "@/lib/site";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLink =
    "rounded-full px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:bg-[#D4AF37]/10 hover:text-[var(--fg)] xl:px-4";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b backdrop-blur-xl backdrop-saturate-150 transition-[box-shadow,background-color,border-color] duration-300 [transition-timing-function:var(--ease-out)]",
        scrolled
          ? "border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-elevated)_94%,transparent)] shadow-[0_12px_40px_-24px_rgba(17,17,17,0.12)]"
          : "border-[color-mix(in_srgb,var(--brand-blush)_55%,var(--line))] bg-[color-mix(in_srgb,var(--brand-cream)_92%,#fff)]",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-3 sm:gap-4 sm:px-6 sm:py-3.5 lg:px-8 xl:max-w-7xl xl:px-10">
        <Link
          href="/"
          className="group flex min-w-0 shrink items-center gap-3 sm:gap-4"
          onClick={() => setOpen(false)}
        >
          <span className="relative h-10 w-[7.5rem] shrink-0 sm:h-11 sm:w-[8.5rem]">
            <Image
              src="/brand/logo.png"
              alt={SITE_NAME}
              fill
              className="object-contain object-left transition duration-300 [transition-timing-function:var(--ease-out)] group-hover:opacity-92"
              sizes="136px"
              priority
            />
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#D4AF37]">
              {STUDIO_ADDRESS_LINE}
            </span>
            <span className="mt-0.5 block font-[family-name:var(--font-display)] text-[1.05rem] font-medium leading-tight tracking-tight text-[var(--fg)] transition duration-300 [transition-timing-function:var(--ease-out)] group-hover:text-[color-mix(in_srgb,var(--fg)_88%,#D4AF37)] sm:text-[1.15rem]">
              {SITE_NAME_LINE}
              <span className="font-normal text-[var(--fg-subtle)]"> · </span>
              <span className="font-normal text-[var(--fg-muted)]">{SITE_TAGLINE}</span>
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {links.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  navLink,
                  active && "bg-[#D4AF37]/14 text-[var(--fg)] ring-1 ring-[#D4AF37]/22",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <HardNavLink
            href={STAFF_LOGIN_PATH}
            className={cn(
              navLink,
              pathname.startsWith("/admin") && "bg-[#D4AF37]/14 text-[var(--fg)] ring-1 ring-[#D4AF37]/22",
            )}
          >
            Staff login
          </HardNavLink>
        </nav>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <HardNavLink
            href={STAFF_LOGIN_PATH}
            className="inline-flex min-h-[2.75rem] items-center rounded-full border border-[var(--line-strong)] bg-[var(--bg-elevated)]/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-[#D4AF37]/35 hover:text-[var(--fg)] lg:hidden sm:min-h-0 sm:px-4"
          >
            Staff
          </HardNavLink>
          <Link
            href="/book"
            className="hidden min-h-[2.75rem] items-center justify-center rounded-full bg-[#D4AF37] px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_14px_36px_-16px_rgba(212,175,55,0.45)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:brightness-[1.06] sm:inline-flex sm:min-h-0"
          >
            Book appointment
          </Link>
          <Link
            href="/book"
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full bg-[#D4AF37] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_28px_-14px_rgba(212,175,55,0.4)] transition duration-200 hover:brightness-[1.06] sm:hidden"
          >
            Book
          </Link>

          <button
            type="button"
            className="min-h-[2.75rem] min-w-[5rem] rounded-full border border-[var(--line-strong)] bg-[var(--bg-elevated)]/90 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:border-[#D4AF37]/35 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        className={cn(
          "border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--bg-elevated)_97%,transparent)] backdrop-blur-xl transition-[max-height,opacity] duration-300 [transition-timing-function:var(--ease-out)] lg:hidden",
          open ? "max-h-[min(70vh,520px)] opacity-100" : "pointer-events-none max-h-0 overflow-hidden opacity-0",
        )}
        aria-hidden={!open}
      >
        <nav
          className="mx-auto max-w-6xl space-y-0.5 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] py-4 sm:px-6 xl:max-w-7xl"
          aria-label="Mobile"
        >
          {links.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-12 items-center rounded-xl px-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-muted)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:bg-[#D4AF37]/10 hover:text-[var(--fg)]",
                  active && "bg-[#D4AF37]/12 text-[var(--fg)]",
                )}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
          <HardNavLink
            href={STAFF_LOGIN_PATH}
            className="mt-2 flex min-h-12 items-center rounded-xl px-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-muted)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:bg-[#D4AF37]/10 hover:text-[var(--fg)]"
            onClick={() => setOpen(false)}
          >
            Staff login
          </HardNavLink>
        </nav>
      </div>
    </header>
  );
}
