"use server";

import { getAdminContext } from "@/lib/auth/admin-context";
import { requireOwner } from "@/lib/auth/admin-guards";
import type { SalonActionResult } from "@/lib/auth/salon-action-result";
import { logSalonAdminSupabaseFailure, metaFromPostgrestError } from "@/lib/admin/admin-supabase-debug";
import {
  OPERATIONAL_RESET_CONFIRM_PHRASE,
  isExactResetConfirmation,
  mapOperationalResetError,
  type OperationalResetPreview,
  type OperationalResetResult,
} from "@/lib/admin/operational-reset";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function revalidateAfterReset() {
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/sales-log");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/purchases");
  revalidatePath("/admin/reconcile");
  revalidatePath("/admin/settings");
}

/** Always emit reset RPC failures (even when SALON_ADMIN_SUPABASE_DEBUG is off). */
function logOperationalResetFailure(scope: string, err: unknown, meta?: Record<string, unknown>) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  console.error(`[salon-admin-supabase] ${scope}`, {
    message,
    ...meta,
    ...metaFromPostgrestError(err),
  });
  // Also go through the gated logger when debug is enabled (includes stack).
  logSalonAdminSupabaseFailure(scope, err, meta);
}

export async function previewOperationalResetAction(): Promise<
  SalonActionResult & { preview?: OperationalResetPreview }
> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_preview_operational_reset");

  if (error) {
    logOperationalResetFailure("rpc:admin_preview_operational_reset", error, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    return { ok: false, error: mapOperationalResetError(error.message ?? "", error.code) };
  }

  return { ok: true, preview: data as OperationalResetPreview };
}

/**
 * Fresh password verification in the current owner session, then issues a short-lived
 * DB reauth challenge required by the destructive reset RPC.
 */
export async function reauthForOperationalResetAction(input: {
  password: string;
}): Promise<SalonActionResult & { reauthChallengeId?: string }> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  const password = input.password ?? "";
  if (password.length < 1) return { ok: false, error: "reauth_required" };

  const email = ctx!.user.email;
  if (!email) return { ok: false, error: "reauth_failed" };

  const supabase = await createSupabaseServerClient();
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    logOperationalResetFailure("auth:signInWithPassword:operational_reset_reauth", authError, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    return { ok: false, error: "reauth_failed" };
  }

  // Confirm still owner after reauth
  const again = await getAdminContext();
  if (!again?.isOwner || again.user.id !== ctx!.user.id) {
    return { ok: false, error: "forbidden_owner_required" };
  }

  const { data: challengeId, error } = await supabase.rpc("admin_issue_operational_reset_reauth");
  if (error) {
    logOperationalResetFailure("rpc:admin_issue_operational_reset_reauth", error, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    return { ok: false, error: mapOperationalResetError(error.message ?? "", error.code) };
  }

  if (!challengeId || typeof challengeId !== "string") {
    return { ok: false, error: "reauth_required" };
  }

  return { ok: true, reauthChallengeId: challengeId };
}

/**
 * Owner-only destructive reset. Never auto-run.
 * Requires: pre-flight preview (UI), backup_confirmed gate, typed phrase, fresh reauth challenge.
 * Does not persist reason or backup_reference.
 */
export async function resetSalesAndInventoryAction(input: {
  confirmation: string;
  backupConfirmed: boolean;
  reauthChallengeId: string;
}): Promise<SalonActionResult & { result?: OperationalResetResult }> {
  const ctx = await getAdminContext();
  const deny = requireOwner(ctx);
  if (deny) return deny;

  if (!isExactResetConfirmation(input.confirmation ?? "")) {
    return { ok: false, error: "confirmation_mismatch" };
  }
  if (!input.backupConfirmed) return { ok: false, error: "backup_confirmation_required" };
  if (!input.reauthChallengeId?.trim()) return { ok: false, error: "reauth_required" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_reset_sales_and_inventory", {
    p_payload: {
      confirmation: OPERATIONAL_RESET_CONFIRM_PHRASE,
      backup_confirmed: true,
      reauth_challenge_id: input.reauthChallengeId.trim(),
    },
  });

  if (error) {
    logOperationalResetFailure("admin_reset_sales_and_inventory", error, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
      supabaseCode: error.code,
      supabaseMessage: error.message,
      supabaseDetails: error.details,
      supabaseHint: error.hint,
    });
    return {
      ok: false,
      error: mapOperationalResetError(
        [error.message, error.details, error.hint].filter(Boolean).join(" | "),
        error.code,
      ),
    };
  }

  revalidateAfterReset();
  return { ok: true, result: data as OperationalResetResult };
}
