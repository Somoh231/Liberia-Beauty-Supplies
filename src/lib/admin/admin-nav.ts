import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  Package,
  Scale,
  Scissors,
  Settings,
  ShoppingBag,
  Truck,
  Upload,
  Users,
} from "lucide-react";
import type { AdminPortalRole } from "@/lib/auth/admin-roles";
import { isSalonManagerOrAboveRole, isSalonOwnerRole } from "@/lib/auth/admin-roles";

export type AdminNavTier = "staff" | "manager" | "owner";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Minimum role tier that can see this item (preserves existing RBAC visibility). */
  minTier: AdminNavTier;
  /** Treat as active when the pathname starts with this prefix (defaults to href). */
  matchPrefix?: string;
};

/** Primary navigation in the exact order from the design spec. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, minTier: "staff", matchPrefix: "/admin" },
  { href: "/admin/sales/new", label: "Sales", icon: ShoppingBag, minTier: "staff", matchPrefix: "/admin/sales" },
  { href: "/admin/services/new", label: "Services", icon: Scissors, minTier: "staff", matchPrefix: "/admin/services" },
  { href: "/admin/sales-log", label: "Sales Log", icon: ClipboardList, minTier: "staff", matchPrefix: "/admin/sales-log" },
  { href: "/admin/inventory", label: "Inventory", icon: Package, minTier: "staff", matchPrefix: "/admin/inventory" },
  { href: "/admin/purchases", label: "Purchases", icon: Truck, minTier: "manager", matchPrefix: "/admin/purchases" },
  { href: "/admin/suppliers", label: "Suppliers", icon: Building2, minTier: "manager", matchPrefix: "/admin/suppliers" },
  { href: "/admin/inventory/import", label: "Import", icon: Upload, minTier: "manager", matchPrefix: "/admin/inventory/import" },
  { href: "/admin/reconcile", label: "Reconcile", icon: Scale, minTier: "manager", matchPrefix: "/admin/reconcile" },
  { href: "/admin/users", label: "Users", icon: Users, minTier: "owner", matchPrefix: "/admin/users" },
  { href: "/admin/settings", label: "Settings", icon: Settings, minTier: "manager", matchPrefix: "/admin/settings" },
];

export function canSeeNavItem(item: AdminNavItem, role: AdminPortalRole): boolean {
  if (item.minTier === "staff") return true;
  if (item.minTier === "manager") return isSalonManagerOrAboveRole(role);
  return isSalonOwnerRole(role);
}

export function navItemsForRole(role: AdminPortalRole): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => canSeeNavItem(item, role));
}

/**
 * Inventory import lives under `/admin/inventory/import`, so order matters:
 * the most specific matching prefix wins to avoid Inventory + Import both active.
 */
export function activeNavHref(pathname: string): string | null {
  let best: { href: string; len: number } | null = null;
  for (const item of ADMIN_NAV_ITEMS) {
    const prefix = item.matchPrefix ?? item.href;
    const isMatch = pathname === prefix || pathname.startsWith(`${prefix}/`);
    if (isMatch && (!best || prefix.length > best.len)) {
      best = { href: item.href, len: prefix.length };
    }
  }
  // Dashboard `/admin` should only be active on exact match, not every subpath.
  if (best && best.href === "/admin" && pathname !== "/admin") {
    // Re-evaluate excluding the broad `/admin` dashboard match.
    let alt: { href: string; len: number } | null = null;
    for (const item of ADMIN_NAV_ITEMS) {
      if (item.href === "/admin") continue;
      const prefix = item.matchPrefix ?? item.href;
      const isMatch = pathname === prefix || pathname.startsWith(`${prefix}/`);
      if (isMatch && (!alt || prefix.length > alt.len)) {
        alt = { href: item.href, len: prefix.length };
      }
    }
    if (alt) return alt.href;
  }
  return best?.href ?? null;
}

/** Breadcrumb + page title resolver for the header (visual only). */
export function resolvePageMeta(pathname: string): { title: string; crumbs: string[] } {
  const map: { test: (p: string) => boolean; title: string; crumbs: string[] }[] = [
    { test: (p) => p === "/admin", title: "Dashboard", crumbs: ["Dashboard"] },
    { test: (p) => p.startsWith("/admin/sales/") && p.endsWith("/edit"), title: "Edit Sale", crumbs: ["Sales Log", "Edit Sale"] },
    { test: (p) => p.startsWith("/admin/sales/new"), title: "New Sale", crumbs: ["Sales", "New Sale"] },
    { test: (p) => p.startsWith("/admin/services/new"), title: "New Service", crumbs: ["Services", "New Service"] },
    { test: (p) => p.startsWith("/admin/sales-log"), title: "Sales Log", crumbs: ["Sales Log"] },
    { test: (p) => p.startsWith("/admin/inventory/import"), title: "Import Inventory", crumbs: ["Inventory", "Import"] },
    { test: (p) => p.startsWith("/admin/inventory/new"), title: "New Product", crumbs: ["Inventory", "New Product"] },
    { test: (p) => /^\/admin\/inventory\/[^/]+$/.test(p), title: "Product", crumbs: ["Inventory", "Product"] },
    { test: (p) => p.startsWith("/admin/inventory"), title: "Inventory", crumbs: ["Inventory"] },
    { test: (p) => p.startsWith("/admin/purchases/new"), title: "New Purchase", crumbs: ["Purchases", "New Purchase"] },
    { test: (p) => p.startsWith("/admin/purchases"), title: "Purchases", crumbs: ["Purchases"] },
    { test: (p) => p.startsWith("/admin/suppliers"), title: "Suppliers", crumbs: ["Suppliers"] },
    { test: (p) => p.startsWith("/admin/reconcile"), title: "Reconcile", crumbs: ["Reconcile"] },
    { test: (p) => p.startsWith("/admin/users"), title: "Users", crumbs: ["Users"] },
    { test: (p) => p.startsWith("/admin/settings"), title: "Settings", crumbs: ["Settings"] },
  ];
  const hit = map.find((m) => m.test(pathname));
  if (hit) return { title: hit.title, crumbs: hit.crumbs };
  return { title: "Admin", crumbs: ["Admin"] };
}
