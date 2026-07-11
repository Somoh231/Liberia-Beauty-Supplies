/** Parser profile identifiers — one workbook may use multiple profiles (multi-block sheets). */
export type InventoryImportParserProfile =
  | "standard_retail"
  | "makeup_retail"
  | "hair_products_mixed"
  | "equipment_lump"
  | "carton"
  | "catalog_name";

export type InventoryImportValidationStatus = "ok" | "warning" | "error" | "needs_review";

export type InventoryImportMode = "catalog" | "financial";

export type InventoryImportRawCells = Record<string, string | number | null>;

export type ParsedInventoryImportRow = {
  /** Stable id for preview UI (sheet + row). */
  id: string;
  sourceSheet: string;
  sourceRow: number;
  parserProfile: InventoryImportParserProfile;
  category: string;
  /** Sub-list / section label from workbook when present. */
  sectionNote: string | null;
  productName: string;
  quantity: number | null;
  unit: string;
  /** Retail in NGN major units (e.g. 21000 = ₦21,000). Unused in catalog mode. */
  retailNgnMajor: number | null;
  retailNgnCents: number | null;
  derivedSellUsdCents: number | null;
  derivedSellLrdCents: number | null;
  validationStatus: InventoryImportValidationStatus;
  validationMessages: string[];
  /** Row excluded from import (subtotal, error, or user skip in preview). */
  skipped: boolean;
  skipReason: string | null;
  raw: InventoryImportRawCells;
  /** Dummy Heads / carton rows require explicit owner confirmation before Phase 3 import. */
  requiresOwnerConfirmation: boolean;
  duplicateKey: string | null;
};

export type InventoryImportCategorySummary = {
  category: string;
  totalRows: number;
  ok: number;
  warning: number;
  error: number;
  needsReview: number;
  skipped: number;
  importable: number;
};

export type InventoryImportPreviewReport = {
  filename: string;
  parsedAt: string;
  mode: InventoryImportMode;
  fxNgnPerUsd: number;
  fxLrdPerUsd: number;
  rows: ParsedInventoryImportRow[];
  categorySummaries: InventoryImportCategorySummary[];
  summary: {
    totalRows: number;
    ok: number;
    warning: number;
    error: number;
    needsReview: number;
    skipped: number;
    importable: number;
    duplicateNameWarnings: number;
    unknownSheets: string[];
    missingExpectedSheets: string[];
    excludedSheets: string[];
  };
};

/** Included worksheets for catalog / financial import (normalized names). */
export const EXPECTED_IMPORT_CATEGORIES = [
  "Human Hair",
  "List of Hair Products",
  "Extensions",
  "Ponytail Hair",
  "Makeup Products",
  "Lash Extension",
  "Hair & Salon Equipment",
  "Microblading",
] as const;

/** Explicitly excluded worksheets — never imported (including all rows inside). */
export const EXCLUDED_IMPORT_CATEGORIES = ["Dummy Heads"] as const;
