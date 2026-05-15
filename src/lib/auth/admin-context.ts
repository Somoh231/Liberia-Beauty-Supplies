import "server-only";

import type { AdminPortalRole } from "@/lib/auth/admin-roles";
import { STAFF_LOGIN_PATH } from "@/lib/auth/safe-admin-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export type { AdminPortalRole } from "@/lib/auth/admin-roles";
export { isSalonStaffRole } from "@/lib/auth/admin-roles";

export type AdminContext = {
  user: User;
  roleSlug: AdminPortalRole;
  /** Owner or legacy admin — full user management, destructive actions. */
  isOwner: boolean;
  /** Owner, admin, or manager — settings, approvals, reports. */
  isManagerOrAbove: boolean;
  /** Any signed-in portal user. */
  isPortalUser: boolean;
};

function normalizePortalRole(slug: string | null | undefined): AdminPortalRole | null {
  if (!slug) return null;
  if (slug === "owner" || slug === "manager" || slug === "staff" || slug === "admin") {
    return slug;
  }
  return null;
}

/**
 * Signed-in user who passes `can_access_admin_portal` RPC, with role from `public.users` + `roles`.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return null;
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return null;

  const { data: allowed, error: rpcErr } = await supabase.rpc("can_access_admin_portal");
  if (rpcErr || !allowed) return null;

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("role_id")
    .eq("id", user.id)
    .maybeSingle();

  // Do not null the whole session on profile select errors (RLS blips, transient PostgREST).
  // Middleware already allowed `can_access_admin_portal`; returning null here caused
  // requireAdminContext → /admin/login ↔ middleware → /admin/inventory redirect loops.
  if (profileErr) {
    console.error("[getAdminContext] public.users select:", profileErr.message);
  }

  let roleSlug: AdminPortalRole | null = null;

  if (!profileErr && profile?.role_id) {
    const { data: roleRow, error: roleErr } = await supabase
      .from("roles")
      .select("slug")
      .eq("id", profile.role_id)
      .maybeSingle();

    if (!roleErr && roleRow?.slug) {
      roleSlug = normalizePortalRole(roleRow.slug as string);
    }
  }

  // Phase 1: portal access can succeed before every user row is fully backfilled with `role_id`.
  if (!roleSlug) {
    roleSlug = "staff";
  }

  const isOwner = roleSlug === "owner" || roleSlug === "admin";
  const isManagerOrAbove = isOwner || roleSlug === "manager";

  return {
    user,
    roleSlug,
    isOwner,
    isManagerOrAbove,
    isPortalUser: true,
  };
}

/** Use in protected admin layouts / pages — redirects to login if missing or forbidden. */
export async function requireAdminContext(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) {
    // `error=context` tells middleware not to auto-bounce back to /admin/inventory from /admin/login
    redirect(`${STAFF_LOGIN_PATH}?error=context`);
  }
  return ctx;
}

