"use server";

import {
  buildImportCommitPlan,
  type InventoryImportRowOverride,
  type UnresolvedRowSnapshot,
} from "@/lib/admin/inventory-import/row-overrides";
import type { InventoryImportPreviewReport } from "@/lib/admin/inventory-import/types";
import { getAdminContext } from "@/lib/auth/admin-context";
import { requireManagerOrAbove } from "@/lib/auth/admin-guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logSalonAdminSupabaseFailure } from "@/lib/admin/admin-supabase-debug";
import { revalidatePath } from "next/cache";

export type InventoryImportCommitResult =
  | {
      ok: true;
      batchId: string;
      summary: {
        importedCount: number;
        skippedUnresolvedCount: number;
        userSkippedCount: number;
        warningCount: number;
        archivedCount: number;
        categoryTotals: Record<string, { imported: number; unresolved: number; skipped: number }>;
      };
    }
  | { ok: false; error: string };

function requireImportAdmin(ctx: Awaited<ReturnType<typeof getAdminContext>>): string | null {
  const deny = requireManagerOrAbove(ctx);
  if (deny && !deny.ok) return deny.error;
  return null;
}

function revalidateInventoryImport() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/import");
  revalidatePath("/admin");
}

/**
 * Phase 3 — transactional import of validated rows only.
 * Archives existing live inventory (first import), skips needs_review unless owner-confirmed (carton).
 */
export async function commitInventoryImportAction(input: {
  report: InventoryImportPreviewReport;
  overrides: Record<string, InventoryImportRowOverride>;
  archiveExisting?: boolean;
  parentBatchId?: string | null;
  /** When set, only rows whose preview_id is in the parent batch unresolved list may import (follow-up). */
  deferredOnly?: boolean;
}): Promise<InventoryImportCommitResult> {
  const ctx = await getAdminContext();
  const deny = requireImportAdmin(ctx);
  if (deny) return { ok: false, error: deny };

  const plan = buildImportCommitPlan(input.report, input.overrides ?? {});

  const supabase = await createSupabaseServerClient();
  let importRows = plan.importRows;
  let unresolvedRows = plan.unresolvedRows;

  if (input.deferredOnly && input.parentBatchId) {
    const { data: parent, error: parentErr } = await supabase
      .from("inventory_import_batches")
      .select("unresolved_rows")
      .eq("id", input.parentBatchId)
      .maybeSingle();
    if (parentErr || !parent) {
      logSalonAdminSupabaseFailure("query:inventory_import_batches parent", parentErr ?? new Error("batch row missing"), {
        userId: ctx!.user.id,
        role: ctx!.salonRole,
        parentBatchId: input.parentBatchId,
        hadParentErr: !!parentErr,
      });
      return { ok: false, error: "batch_not_found" };
    }

    const allowed = new Set(
      ((parent.unresolved_rows as { preview_id?: string }[] | null) ?? []).map((r) => r.preview_id).filter(Boolean),
    );
    importRows = importRows.filter((r) => allowed.has(r.preview_id));
    if (importRows.length === 0) return { ok: false, error: "no_deferred_rows_ready" };

    const importedIds = new Set(importRows.map((r) => r.preview_id));
    const stillUnresolved = [
      ...((parent.unresolved_rows as UnresolvedRowSnapshot[] | null) ?? []).filter(
        (r) => !importedIds.has(r.preview_id),
      ),
      ...unresolvedRows.filter((r) => !importedIds.has(r.preview_id)),
    ];
    unresolvedRows = stillUnresolved;
  }

  if (importRows.length === 0) {
    return { ok: false, error: "no_importable_rows" };
  }

  const { data: batchId, error } = await supabase.rpc("commit_inventory_workbook_import", {
    p_payload: {
      filename: input.report.filename,
      archive_existing: input.archiveExisting !== false,
      fx_ngn_per_usd: input.report.fxNgnPerUsd,
      fx_lrd_per_usd: input.report.fxLrdPerUsd,
      parent_batch_id: input.parentBatchId ?? null,
      import_rows: importRows,
      unresolved_rows: unresolvedRows,
      skipped_count: plan.skippedCount,
      error_count: plan.errorCount,
      category_totals: plan.categoryTotals,
    },
  });

  if (error) {
    logSalonAdminSupabaseFailure("rpc:commit_inventory_workbook_import", error, {
      userId: ctx!.user.id,
      role: ctx!.salonRole,
    });
    const msg = error.message ?? "import_failed";
    if (msg.includes("forbidden") || msg.includes("42501")) return { ok: false, error: "forbidden" };
    return { ok: false, error: msg };
  }

  if (!batchId || typeof batchId !== "string") {
    return { ok: false, error: "missing_batch_id" };
  }

  if (input.deferredOnly && input.parentBatchId) {
    await supabase
      .from("inventory_import_batches")
      .update({
        unresolved_rows: unresolvedRows,
        unresolved_count: unresolvedRows.length,
      })
      .eq("id", input.parentBatchId);
  }

  const { data: batch } = await supabase
    .from("inventory_import_batches")
    .select("imported_count, unresolved_count, skipped_count, warning_count, archived_count, category_totals")
    .eq("id", batchId)
    .maybeSingle();

  revalidateInventoryImport();

  const row = batch as {
    imported_count: number;
    unresolved_count: number;
    skipped_count: number;
    warning_count: number;
    archived_count: number;
    category_totals: Record<string, { imported: number; unresolved: number; skipped: number }>;
  } | null;

  return {
    ok: true,
    batchId,
    summary: {
      importedCount: row?.imported_count ?? importRows.length,
      skippedUnresolvedCount: row?.unresolved_count ?? unresolvedRows.length,
      userSkippedCount: row?.skipped_count ?? plan.skippedCount,
      warningCount: row?.warning_count ?? plan.warningCount,
      archivedCount: row?.archived_count ?? 0,
      categoryTotals: row?.category_totals ?? plan.categoryTotals,
    },
  };
}
