import { deriveRetailFromNgnMajor } from "@/lib/admin/inventory-import/derive-pricing";
import type {
  InventoryImportPreviewReport,
  ParsedInventoryImportRow,
} from "@/lib/admin/inventory-import/types";
import { resolveCatalogItemType } from "@/lib/admin/inventory-sellability";

export type InventoryImportRowOverride = {
  skipped?: boolean;
  quantity?: number;
  retailNgnMajor?: number;
  ownerConfirmed?: boolean;
};

export type ImportRowDisposition = "import" | "unresolved" | "user_skipped" | "error";

/** Apply preview UI overrides to a parsed row (shared client + server). */
export function applyInventoryImportOverride(
  row: ParsedInventoryImportRow,
  override: InventoryImportRowOverride | undefined,
  fx: { ngnPerUsd: number; lrdPerUsd: number },
): ParsedInventoryImportRow {
  const merged: ParsedInventoryImportRow = { ...row, validationMessages: [...row.validationMessages] };
  if (override?.skipped) {
    merged.skipped = true;
    merged.skipReason = "user_skipped";
    return merged;
  }
  if (override?.quantity != null) merged.quantity = override.quantity;
  if (override?.retailNgnMajor != null) {
    merged.retailNgnMajor = override.retailNgnMajor;
    const d = deriveRetailFromNgnMajor(override.retailNgnMajor, { ngnPerUsd: fx.ngnPerUsd, lrdPerUsd: fx.lrdPerUsd });
    merged.retailNgnCents = d.retailNgnCents;
    merged.derivedSellUsdCents = d.sellUsdCents;
    merged.derivedSellLrdCents = d.sellLrdCents;
  }
  if (row.requiresOwnerConfirmation && override?.ownerConfirmed) {
    merged.validationMessages.push("Owner confirmed carton interpretation for import");
    if (merged.validationStatus === "needs_review" && merged.retailNgnMajor != null && merged.quantity != null) {
      merged.validationStatus = "warning";
      merged.skipped = false;
      merged.skipReason = null;
    }
  }
  return merged;
}

export function classifyImportRow(row: ParsedInventoryImportRow): ImportRowDisposition {
  if (row.skipped || row.skipReason === "user_skipped") return "user_skipped";
  if (row.validationStatus === "error") return "error";
  if (row.validationStatus === "needs_review") return "unresolved";
  if (row.validationStatus === "ok" || row.validationStatus === "warning") return "import";
  return "error";
}

export type ImportCommitRowPayload = {
  preview_id: string;
  product_name: string;
  category: string;
  quantity: number;
  unit: string;
  /** Catalog seed uses null (no spreadsheet price). Financial import uses cents. */
  retail_ngn_cents: number | null;
  sell_usd_cents: number | null;
  sell_lrd_cents: number | null;
  notes: string | null;
  validation_status: "ok" | "warning";
  /** Catalog-only seed: ignore quantity/retail and create empty setup SKUs. */
  catalog_only?: boolean;
  source_sheet?: string;
  source_row?: number;
  /**
   * Catalog seed always sends needs_setup; commit_inventory_catalog_seed persists it.
   */
  setup_status?: "needs_setup";
  /**
   * retail by default; asset names force asset (persisted by catalog seed RPC).
   */
  item_type?: "retail" | "asset";
};

export type UnresolvedRowSnapshot = {
  preview_id: string;
  source_sheet: string;
  source_row: number;
  category: string;
  product_name: string;
  quantity: number | null;
  unit: string;
  retail_ngn_major: number | null;
  validation_status: string;
  validation_messages: string[];
  requires_owner_confirmation: boolean;
};

export type ImportCommitPlan = {
  importRows: ImportCommitRowPayload[];
  unresolvedRows: UnresolvedRowSnapshot[];
  skippedCount: number;
  errorCount: number;
  warningCount: number;
  categoryTotals: Record<string, { imported: number; unresolved: number; skipped: number }>;
  catalogOnly: boolean;
};

function noteFromRow(row: ParsedInventoryImportRow): string | null {
  const parts: string[] = [];
  if (row.sectionNote) parts.push(row.sectionNote);
  parts.push(`Source: ${row.sourceSheet} row ${row.sourceRow}`);
  return parts.length ? parts.join(" · ") : null;
}

function toCatalogImportPayload(row: ParsedInventoryImportRow): ImportCommitRowPayload | null {
  const name = row.productName.trim();
  if (name.length < 2) return null;
  if (row.validationStatus !== "ok" && row.validationStatus !== "warning") return null;
  const itemType = resolveCatalogItemType(name);
  // Never carry spreadsheet qty/cost/price/rate/total into the seed payload.
  return {
    preview_id: row.id,
    product_name: name,
    category: row.category.trim(),
    quantity: 0,
    unit: "each",
    retail_ngn_cents: null,
    sell_usd_cents: null,
    sell_lrd_cents: null,
    notes: noteFromRow(row),
    validation_status: row.validationStatus,
    catalog_only: true,
    source_sheet: row.sourceSheet,
    source_row: row.sourceRow,
    setup_status: "needs_setup",
    item_type: itemType,
  };
}

function toImportPayload(row: ParsedInventoryImportRow): ImportCommitRowPayload | null {
  if (row.quantity == null || row.retailNgnCents == null || row.retailNgnCents <= 0) return null;
  if (row.validationStatus !== "ok" && row.validationStatus !== "warning") return null;
  return {
    preview_id: row.id,
    product_name: row.productName.trim(),
    category: row.category,
    quantity: row.quantity,
    unit: row.unit || "each",
    retail_ngn_cents: row.retailNgnCents,
    sell_usd_cents: row.derivedSellUsdCents,
    sell_lrd_cents: row.derivedSellLrdCents,
    notes: noteFromRow(row),
    validation_status: row.validationStatus,
    catalog_only: false,
    source_sheet: row.sourceSheet,
    source_row: row.sourceRow,
  };
}

function toUnresolvedSnapshot(row: ParsedInventoryImportRow): UnresolvedRowSnapshot {
  return {
    preview_id: row.id,
    source_sheet: row.sourceSheet,
    source_row: row.sourceRow,
    category: row.category,
    product_name: row.productName,
    quantity: row.quantity,
    unit: row.unit,
    retail_ngn_major: row.retailNgnMajor,
    validation_status: row.validationStatus,
    validation_messages: row.validationMessages,
    requires_owner_confirmation: row.requiresOwnerConfirmation,
  };
}

/** Build server commit payload from preview report + overrides. */
export function buildImportCommitPlan(
  report: InventoryImportPreviewReport,
  overrides: Record<string, InventoryImportRowOverride>,
): ImportCommitPlan {
  const fx = { ngnPerUsd: report.fxNgnPerUsd, lrdPerUsd: report.fxLrdPerUsd };
  const catalogOnly = report.mode !== "financial";
  const importRows: ImportCommitRowPayload[] = [];
  const unresolvedRows: UnresolvedRowSnapshot[] = [];
  let skippedCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  const categoryTotals: Record<string, { imported: number; unresolved: number; skipped: number }> = {};
  const seenUnique = new Set<string>();

  const bumpCat = (cat: string, field: "imported" | "unresolved" | "skipped") => {
    if (!categoryTotals[cat]) categoryTotals[cat] = { imported: 0, unresolved: 0, skipped: 0 };
    categoryTotals[cat][field] += 1;
  };

  for (const raw of report.rows) {
    const row = applyInventoryImportOverride(raw, overrides[raw.id], fx);
    const disposition = classifyImportRow(row);

    if (disposition === "import") {
      const payload = catalogOnly ? toCatalogImportPayload(row) : toImportPayload(row);
      if (!payload) {
        errorCount += 1;
        unresolvedRows.push(toUnresolvedSnapshot(row));
        bumpCat(row.category, "unresolved");
        continue;
      }

      // Enforce unique category + lower(name). On conflict, report and skip (no duplicate).
      const uniqueKey = `${payload.category}::${payload.product_name.toLowerCase()}`;
      if (seenUnique.has(uniqueKey)) {
        skippedCount += 1;
        unresolvedRows.push({
          ...toUnresolvedSnapshot(row),
          validation_status: "duplicate_skipped",
          validation_messages: [
            ...row.validationMessages,
            `Skipped duplicate category+name: ${payload.category} / ${payload.product_name}`,
          ],
        });
        bumpCat(row.category, "skipped");
        continue;
      }
      seenUnique.add(uniqueKey);

      importRows.push(payload);
      if (row.validationStatus === "warning") warningCount += 1;
      bumpCat(row.category, "imported");
    } else if (disposition === "unresolved") {
      unresolvedRows.push(toUnresolvedSnapshot(row));
      bumpCat(row.category, "unresolved");
    } else if (disposition === "user_skipped") {
      skippedCount += 1;
      bumpCat(row.category, "skipped");
    } else {
      errorCount += 1;
      bumpCat(row.category, "unresolved");
    }
  }

  return {
    importRows,
    unresolvedRows,
    skippedCount,
    errorCount,
    warningCount,
    categoryTotals,
    catalogOnly,
  };
}
