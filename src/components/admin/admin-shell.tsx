"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import type { AdminPortalRole } from "@/lib/auth/admin-roles";

export function AdminShell({
  email,
  fullName,
  roleSlug,
  logoSrc,
  children,
}: {
  email: string;
  fullName: string | null;
  roleSlug: AdminPortalRole;
  logoSrc?: string | null;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer on route change.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <div className="min-h-full">
      {/* Fixed sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-[var(--admin-border)] lg:block">
        <AdminSidebar email={email} fullName={fullName} roleSlug={roleSlug} logoSrc={logoSrc} />
      </aside>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 flex w-[260px] max-w-[80vw] flex-col border-r border-[var(--admin-border)] shadow-2xl admin-dropdown-in">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="admin-icon-btn absolute right-3 top-3 z-10"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <AdminSidebar
              email={email}
              fullName={fullName}
              roleSlug={roleSlug}
              logoSrc={logoSrc}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* Content column */}
      <div className="flex min-h-full flex-col lg:pl-[260px]">
        <AdminHeader email={email} fullName={fullName} roleSlug={roleSlug} onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1400px] px-5 py-8 sm:px-8 sm:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
