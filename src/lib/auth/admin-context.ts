import "server-only";

import type { AdminPortalRole, SalonRole } from "@/lib/auth/admin-roles";
import { normalizeSalonRole } from "@/lib/auth/admin-roles";
import { isPortalProfileAllowed } from "@/lib/auth/admin-portal-access";
import { STAFF_LOGIN_PATH } from "@/lib/auth/safe-admin-next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

export type { AdminPortalRole } from "@/lib/auth/admin-roles";
export { isSalonStaffRole, roleBadgeLabel } from "@/lib/auth/admin-roles";

export type AdminContext = {
  user: User;
  roleSlug: AdminPortalRole;
  salonRole: SalonRole;
  fullName: string | null;
  isActive: boolean;
  /** Owner or legacy admin — full user management, destructive actions. */
  isOwner: boolean;
  /** Owner, admin, or manager — settings, imports, corrections, reports. */
  isManagerOrAbove: boolean;
  /** Front-desk staff tier. */
  isStaff: boolean;
  /** Any signed-in portal user. */
  isPortalUser: boolean;
};

/**
 * Signed-in user with an active portal profile (read-only — no access RPC side effects).
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

  const { data: profile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("role, active, full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("[getAdminContext] user_profiles select:", profileErr.message);
    return null;
  }

  if (!isPortalProfileAllowed(profile)) return null;

  const salonRole = normalizeSalonRole(profile.role)!;
  const roleSlug: AdminPortalRole = salonRole;
  const isOwner = salonRole === "owner";
  const isManagerOrAbove = isOwner || salonRole === "manager";

  return {
    user,
    roleSlug,
    salonRole,
    fullName: profile.full_name ?? null,
    isActive: profile.active,
    isOwner,
    isManagerOrAbove,
    isStaff: salonRole === "staff",
    isPortalUser: true,
  };
}

/** Use in protected admin layouts / pages — redirects to login if missing or forbidden. */
export async function requireAdminContext(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect(`${STAFF_LOGIN_PATH}?error=context`);
  }
  return ctx;
}

/** Owner-only pages and destructive operations. */
export async function requireOwnerContext(): Promise<AdminContext> {
  const ctx = await requireAdminContext();
  if (!ctx.isOwner) {
    redirect("/admin");
  }
  return ctx;
}
