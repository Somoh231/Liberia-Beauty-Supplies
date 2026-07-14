import * as XLSX from "xlsx";
import {
  cellString,
  isHeaderRow,
  isSubtotalOrTotalRow,
  normalizeSheetName,
} from "@/lib/admin/inventory-import/parse-utils";
import {
  detectProfileForSheet,
  isEquipmentLumpHeader,
  parseCatalogNameRow,
  parseRowWithProfile,
} from "@/lib/admin/inventory-import/profiles";
import type {
  InventoryImportCategorySummary,
  InventoryImportMode,
  InventoryImportPreviewReport,
  InventoryImportValidationStatus,
  ParsedInventoryImportRow,
} from "@/lib/admin/inventory-import/types";
import { EXCLUDED_IMPORT_CATEGORIES, EXPECTED_IMPORT_CATEGORIES } from "@/lib/admin/inventory-import/types";
import {
  getOperationalFx,
  type OperationalFxRates,
} from "@/lib/admin/pricing-engine";

const MULTI_BLOCK_SHEETS = new Set(["Hair & Salon Equipment", "Microblading"]);

function sheetToCategory(normalizedSheetName: string): string {
  return normalizedSheetName;
}

function rowToCells(row: unknown[]): string[] {
  return row.map((c) => cellString(c));
}

function countByStatus(rows: ParsedInventoryImportRow[], status: InventoryImportValidationStatus): number {
  return rows.filter((r) => r.validationStatus === status).length;
}

function buildCategorySummaries(rows: ParsedInventoryImportRow[]): InventoryImportCategorySummary[] {
  const byCat = new Map<string, ParsedInventoryImportRow[]>();
  for (const r of rows) {
    const list = byCat.get(r.category) ?? [];
    list.push(r);
    byCat.set(r.category, list);
  }
  return [...byCat.entries()]
    .map(([category, catRows]) => ({
      category,
      totalRows: catRows.length,
      ok: countByStatus(catRows, "ok"),
      warning: countByStatus(catRows, "warning"),
      error: countByStatus(catRows, "error"),
      needsReview: countByStatus(catRows, "needs_review"),
      skipped: catRows.filter((r) => r.skipped).length,
      importable: catRows.filter((r) => !r.skipped && r.validationStatus !== "error" && r.validationStatus !== "needs_review").length,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function applyDuplicateWarnings(rows: ParsedInventoryImportRow[]): number {
  const seen = new Map<string, ParsedInventoryImportRow[]>();
  for (const r of rows) {
    if (!r.duplicateKey) continue;
    const list = seen.get(r.duplicateKey) ?? [];
    list.push(r);
    seen.set(r.duplicateKey, list);
  }
  let warnings = 0;
  for (const [, group] of seen) {
    if (group.length < 2) continue;
    warnings += group.length;
    for (const r of group) {
      if (r.validationStatus === "ok") r.validationStatus = "warning";
      else if (r.validationStatus === "needs_review") {
        /* keep needs_review */
      }
      const msg = `Duplicate product name in category (${group.length} rows): ${group.map((x) => `row ${x.sourceRow}`).join(", ")}`;
      if (!r.validationMessages.includes(msg)) r.validationMessages.push(msg);
    }
  }
  return warnings;
}

function parseSheetRows(
  sheetName: string,
  matrix: unknown[][],
  fx: OperationalFxRates,
  mode: InventoryImportMode,
): ParsedInventoryImportRow[] {
  const category = sheetToCategory(sheetName);
  let profile = detectProfileForSheet(sheetName);
  let sectionNote: string | null = null;
  const out: ParsedInventoryImportRow[] = [];

  for (let i = 0; i < matrix.length; i++) {
    const rowIndex = i + 1;
    const row = matrix[i] ?? [];
    const cells = rowToCells(row);

    if (!cells.some((c) => c.length > 0)) continue;
    if (isSubtotalOrTotalRow(cells)) continue;

    if (isHeaderRow(cells)) {
      if (MULTI_BLOCK_SHEETS.has(sheetName) && isEquipmentLumpHeader(cells)) {
        profile = "equipment_lump";
        sectionNote = sheetName === "Hair & Salon Equipment" ? "Pedicure & Manicure equipment" : "Industrial equipment";
      } else if (!isEquipmentLumpHeader(cells)) {
        profile = detectProfileForSheet(sheetName);
        sectionNote = null;
      }
      continue;
    }

    // Skip SN-only or label rows without product name (catalog uses col B exclusively)
    const productName = cells[1]?.trim() ?? "";
    if (!productName) continue;
    if (/TOTAL/i.test(productName)) continue;
    if (/^\d+(\.\d+)?$/.test(productName)) continue;

    if (mode === "catalog") {
      const parsed = parseCatalogNameRow(row, {
        sheet: sheetName,
        category,
        rowIndex,
        fx,
        sectionNote,
        profileHint: profile,
      });
      if (parsed) out.push(parsed);
      continue;
    }

    const parsed = parseRowWithProfile(profile, row, {
      sheet: sheetName,
      category,
      rowIndex,
      fx,
      sectionNote,
    });
    if (parsed) out.push(parsed);
  }

  return out;
}

/**
 * Parse workbook bytes into preview report. NO database writes.
 * Default mode is `catalog` (names + categories only).
 *
 * Sheet names and header cells are trimmed before matching. The Dummy Heads
 * sheet is excluded even when its workbook name has trailing spaces.
 * Missing expected sheets or unexpected non-excluded sheets throw loudly.
 */
export function parseInventoryWorkbookBuffer(
  buffer: ArrayBuffer,
  filename: string,
  fx: OperationalFxRates = getOperationalFx(),
  mode: InventoryImportMode = "catalog",
): InventoryImportPreviewReport {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const normalizedInFile = new Map<string, string>();
  for (const rawName of wb.SheetNames) {
    normalizedInFile.set(normalizeSheetName(rawName), rawName);
  }

  const unknownSheets: string[] = [];
  const excludedSheets: string[] = [];
  const missingExpectedSheets: string[] = [];
  const allRows: ParsedInventoryImportRow[] = [];

  for (const rawName of wb.SheetNames) {
    const norm = normalizeSheetName(rawName);
    const expected = EXPECTED_IMPORT_CATEGORIES.some((c) => c === norm);
    const excluded = EXCLUDED_IMPORT_CATEGORIES.some((c) => c === norm);
    if (excluded) excludedSheets.push(rawName);
    else if (!expected) unknownSheets.push(rawName);
  }

  for (const expected of EXPECTED_IMPORT_CATEGORIES) {
    if (!normalizedInFile.has(expected)) missingExpectedSheets.push(expected);
  }

  if (missingExpectedSheets.length > 0) {
    throw new Error(
      `Missing expected workbook sheet(s) after trim: ${missingExpectedSheets.join(", ")}. ` +
        `Required sheets: ${EXPECTED_IMPORT_CATEGORIES.join(", ")}.`,
    );
  }

  if (unknownSheets.length > 0) {
    throw new Error(
      `Unexpected workbook sheet(s) (after trim): ${unknownSheets
        .map((s) => JSON.stringify(s))
        .join(", ")}. ` +
        `Only the 8 expected categories plus excluded sheet(s) [${EXCLUDED_IMPORT_CATEGORIES.join(", ")}] are allowed.`,
    );
  }

  for (const expected of EXPECTED_IMPORT_CATEGORIES) {
    const rawName = normalizedInFile.get(expected);
    if (!rawName) continue;
    const ws = wb.Sheets[rawName];
    if (!ws) {
      throw new Error(`Expected sheet ${JSON.stringify(expected)} resolved to ${JSON.stringify(rawName)} but worksheet data is missing.`);
    }
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true }) as unknown[][];
    allRows.push(...parseSheetRows(expected, matrix, fx, mode));
  }

  const duplicateNameWarnings = applyDuplicateWarnings(allRows);
  const categorySummaries = buildCategorySummaries(allRows);

  const skipped = allRows.filter((r) => r.skipped).length;
  const importable = allRows.filter(
    (r) => !r.skipped && (r.validationStatus === "ok" || r.validationStatus === "warning"),
  ).length;

  return {
    filename,
    parsedAt: new Date().toISOString(),
    mode,
    fxNgnPerUsd: fx.ngnPerUsd,
    fxLrdPerUsd: fx.lrdPerUsd,
    rows: allRows,
    categorySummaries,
    summary: {
      totalRows: allRows.length,
      ok: countByStatus(allRows, "ok"),
      warning: countByStatus(allRows, "warning"),
      error: countByStatus(allRows, "error"),
      needsReview: countByStatus(allRows, "needs_review"),
      skipped,
      importable,
      duplicateNameWarnings,
      unknownSheets,
      missingExpectedSheets,
      excludedSheets: [...new Set(excludedSheets)],
    },
  };
}
