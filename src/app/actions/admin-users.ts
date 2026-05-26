"use server";

import type { SalonRole } from "@/lib/auth/admin-roles";
import { getAdminContext } from "@/lib/auth/admin-context";
import { requireOwner } from "@/lib/auth/admin-guards";
import type { SalonActionResult } from "@/lib/auth/salon-action-result";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type UserProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: SalonRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: SalonRole[] = ["owner", "manager", "staff"];

function parseRole(raw: string): SalonRole | null {
  const r = raw.trim().toLowerCase();
  return ROLES.includes(r as SalonRole) ? (r as SalonRole) : null;
}

async function countActiveOwners(excludeId?: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("user_profiles").select("id", { count: "exact", head: true }).eq("role", "owner").eq("active", true);
  if (excludeId) q = q.neq("id", excludeId);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

function revalidateUsers() {
  revalidatePath("/admin/users");
}

export async function fetchSalonUserProfiles(): Promise<UserProfileRow[]> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id,email,full_name,role,active,created_at,updated_at,last_login_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[fetchSalonUserProfiles]", error.message);
    return [];
  }
  return (data ?? []) as UserProfileRow[];
}

export async function createSalonUserAction(input: {
  fullName: string;
  email: string;
  password: string;
  role: string;
}): Promise<SalonActionResult & { id?: string }> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const password = input.password;
  const role = parseRole(input.role);

  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };
  if (fullName.length < 2) return { ok: false, error: "invalid_name" };
  if (password.length < 8) return { ok: false, error: "weak_password" };
  if (!role) return { ok: false, error: "invalid_role" };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "server_config" };

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authErr || !authUser.user) {
    const msg = authErr?.message ?? "auth_create_failed";
    if (msg.toLowerCase().includes("already")) return { ok: false, error: "email_in_use" };
    return { ok: false, error: "auth_create_failed" };
  }

  const userId = authUser.user.id;
  const { error: profileErr } = await admin.from("user_profiles").insert({
    id: userId,
    email,
    full_name: fullName,
    role,
    active: true,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    if (profileErr.message.includes("duplicate") || profileErr.code === "23505") {
      return { ok: false, error: "email_in_use" };
    }
    return { ok: false, error: "profile_create_failed" };
  }

  revalidateUsers();
  return { ok: true, id: userId };
}

export async function updateSalonUserRoleAction(input: {
  userId: string;
  role: string;
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  const role = parseRole(input.role);
  if (!role) return { ok: false, error: "invalid_role" };
  if (input.userId === ctx!.user.id && role !== "owner") {
    const owners = await countActiveOwners(ctx!.user.id);
    if (owners === 0) return { ok: false, error: "last_owner" };
  }
  if (input.userId !== ctx!.user.id) {
    const supabase = await createSupabaseServerClient();
    const { data: target } = await supabase.from("user_profiles").select("role").eq("id", input.userId).maybeSingle();
    if (target?.role === "owner" && role !== "owner") {
      const owners = await countActiveOwners(input.userId);
      if (owners === 0) return { ok: false, error: "last_owner" };
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_profiles").update({ role }).eq("id", input.userId);
  if (error) return { ok: false, error: error.message };
  revalidateUsers();
  return { ok: true };
}

export async function setSalonUserActiveAction(input: {
  userId: string;
  active: boolean;
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  if (input.userId === ctx!.user.id && !input.active) {
    return { ok: false, error: "cannot_deactivate_self" };
  }

  if (!input.active) {
    const supabase = await createSupabaseServerClient();
    const { data: target } = await supabase.from("user_profiles").select("role, active").eq("id", input.userId).maybeSingle();
    if (target?.role === "owner" && target.active) {
      const owners = await countActiveOwners(input.userId);
      if (owners === 0) return { ok: false, error: "last_owner" };
    }
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "server_config" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_profiles").update({ active: input.active }).eq("id", input.userId);
  if (error) return { ok: false, error: error.message };

  await admin.auth.admin.updateUserById(input.userId, {
    ban_duration: input.active ? "none" : "876000h",
  });

  revalidateUsers();
  return { ok: true };
}

export async function resetSalonUserPasswordAction(input: {
  userId: string;
  password: string;
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  if (input.password.length < 8) return { ok: false, error: "weak_password" };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "server_config" };

  const { error } = await admin.auth.admin.updateUserById(input.userId, { password: input.password });
  if (error) return { ok: false, error: "password_reset_failed" };
  return { ok: true };
}

export async function updateSalonUserProfileAction(input: {
  userId: string;
  fullName: string;
}): Promise<SalonActionResult> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  const fullName = input.fullName.trim();
  if (fullName.length < 2) return { ok: false, error: "invalid_name" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_profiles").update({ full_name: fullName }).eq("id", input.userId);
  if (error) return { ok: false, error: error.message };
  revalidateUsers();
  return { ok: true };
}
