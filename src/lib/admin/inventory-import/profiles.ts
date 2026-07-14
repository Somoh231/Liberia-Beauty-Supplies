import {
  approxEqual,
  cellString,
  isEquipmentLumpHeader,
  parseNumericCell,
  parseQuantityCell,
} from "@/lib/admin/inventory-import/parse-utils";
import type {
  InventoryImportParserProfile,
  InventoryImportRawCells,
  InventoryImportValidationStatus,
  ParsedInventoryImportRow,
} from "@/lib/admin/inventory-import/types";
import { deriveRetailFromNgnMajor } from "@/lib/admin/inventory-import/derive-pricing";
import type { OperationalFxRates } from "@/lib/admin/pricing-engine";

type ParseContext = {
  sheet: string;
  category: string;
  rowIndex: number;
  fx: OperationalFxRates;
  sectionNote: string | null;
};

function baseRow(ctx: ParseContext, profile: InventoryImportParserProfile, raw: InventoryImportRawCells): ParsedInventoryImportRow {
  return {
    id: `${ctx.sheet}::${ctx.rowIndex}`,
    sourceSheet: ctx.sheet,
    sourceRow: ctx.rowIndex,
    parserProfile: profile,
    category: ctx.category,
    sectionNote: ctx.sectionNote,
    productName: "",
    quantity: null,
    unit: "each",
    retailNgnMajor: null,
    retailNgnCents: null,
    derivedSellUsdCents: null,
    derivedSellLrdCents: null,
    validationStatus: "error",
    validationMessages: [],
    skipped: false,
    skipReason: null,
    raw,
    requiresOwnerConfirmation: false,
    duplicateKey: null,
  };
}

function finalizeRow(row: ParsedInventoryImportRow, fx: OperationalFxRates): ParsedInventoryImportRow {
  const messages = [...row.validationMessages];

  if (!row.productName.trim()) {
    messages.push("Missing product name");
    row.validationStatus = "error";
    row.skipped = true;
    row.skipReason = "missing_product_name";
  }

  if (row.quantity == null || !Number.isFinite(row.quantity) || row.quantity < 0) {
    messages.push("Invalid or missing quantity");
    if (row.validationStatus !== "needs_review") row.validationStatus = "error";
  }

  if (row.retailNgnMajor == null || row.retailNgnMajor <= 0) {
    messages.push("Invalid or missing retail NGN");
    if (row.validationStatus === "ok" || row.validationStatus === "warning") {
      row.validationStatus = row.validationStatus === "warning" ? "warning" : "error";
    }
    if (row.validationStatus === "error") {
      row.skipped = true;
      row.skipReason = row.skipReason ?? "invalid_retail";
    }
  } else {
    const derived = deriveRetailFromNgnMajor(row.retailNgnMajor, fx);
    row.retailNgnCents = derived.retailNgnCents;
    row.derivedSellUsdCents = derived.sellUsdCents;
    row.derivedSellLrdCents = derived.sellLrdCents;
  }

  if (row.requiresOwnerConfirmation && row.validationStatus === "ok") {
    row.validationStatus = "needs_review";
    messages.push("Requires explicit owner confirmation before import (carton interpretation)");
  }

  row.validationMessages = messages;
  if (row.validationStatus === "error") {
    row.skipped = true;
    row.skipReason = row.skipReason ?? "validation_error";
  }
  if (row.validationStatus === "needs_review") {
    row.skipped = true;
    row.skipReason = row.skipReason ?? "needs_review";
  }

  row.duplicateKey = row.productName.trim()
    ? `${row.category}::${row.productName.trim().toLowerCase()}`
    : null;

  return row;
}

type CatalogParseContext = ParseContext & {
  profileHint: InventoryImportParserProfile;
};

/** Catalog-only row: product name (col B) + category; no financial inference. */
export function parseCatalogNameRow(cells: unknown[], ctx: CatalogParseContext): ParsedInventoryImportRow | null {
  // Product names always come from column B — including List of Hair Products
  // (column A holds "1st List" / "2nd List" markers only).
  const productName = cellString(cells[1]).trim();
  if (!productName || productName.length < 2) return null;
  if (/TOTAL/i.test(productName)) return null;
  if (/^\d+(\.\d+)?$/.test(productName)) return null;
  if (/^(s\/?n|list|quantity|retail|rate|item name)$/i.test(productName)) return null;

  const sectionFromColA = cellString(cells[0]).trim();
  const sectionNote =
    ctx.sectionNote ||
    (/^(1st|2nd)\s+list$/i.test(sectionFromColA) ? sectionFromColA : null);

  const raw: InventoryImportRawCells = {
    product_name: productName,
    source_sheet: ctx.sheet,
    source_row: ctx.rowIndex,
  };
  const row = baseRow(ctx, "catalog_name", raw);
  row.productName = productName;
  row.quantity = null;
  row.unit = "each";
  row.retailNgnMajor = null;
  row.retailNgnCents = null;
  row.derivedSellUsdCents = null;
  row.derivedSellLrdCents = null;
  row.requiresOwnerConfirmation = false;
  row.validationStatus = "ok";
  row.validationMessages = [];
  row.skipped = false;
  row.skipReason = null;
  row.duplicateKey = `${row.category}::${productName.toLowerCase()}`;
  row.sectionNote = sectionNote;
  return row;
}

export function parseStandardRetailRow(cells: unknown[], ctx: ParseContext): ParsedInventoryImportRow {
  const raw: InventoryImportRawCells = {
    sn: cellString(cells[0]),
    product_name: cellString(cells[1]),
    quantity: parseNumericCell(cells[2]),
    retail_ngn: parseNumericCell(cells[3]),
    rate_calculation: cellString(cells[4]),
    total_ngn: parseNumericCell(cells[5]),
  };
  const row = baseRow(ctx, "standard_retail", raw);
  row.productName = raw.product_name as string;

  const { qty, unit } = parseQuantityCell(cells[2]);
  row.quantity = qty;
  row.unit = unit;

  const retail = raw.retail_ngn as number | null;
  const total = raw.total_ngn as number | null;
  row.retailNgnMajor = retail;

  const messages: string[] = [];
  let status: InventoryImportValidationStatus = "ok";

  if (qty != null && retail != null && total != null && !approxEqual(qty * retail, total)) {
    messages.push(`Quantity × retail (${qty} × ${retail} = ${qty * retail}) does not match total (${total})`);
    status = "warning";
  } else if (retail == null) {
    status = "error";
  }

  row.validationStatus = status;
  row.validationMessages = messages;
  return finalizeRow(row, ctx.fx);
}

export function parseMakeupRetailRow(cells: unknown[], ctx: ParseContext): ParsedInventoryImportRow {
  const raw: InventoryImportRawCells = {
    sn: cellString(cells[0]),
    product_name: cellString(cells[1]),
    quantity: parseNumericCell(cells[2]),
    retail_ngn: parseNumericCell(cells[3]),
    total_ngn: parseNumericCell(cells[4]),
  };
  const row = baseRow(ctx, "makeup_retail", raw);
  row.productName = raw.product_name as string;

  const { qty, unit } = parseQuantityCell(cells[2]);
  row.quantity = qty;
  row.unit = unit;
  row.retailNgnMajor = raw.retail_ngn as number | null;

  const messages: string[] = [];
  let status: InventoryImportValidationStatus = "ok";
  const retail = row.retailNgnMajor;
  const total = raw.total_ngn as number | null;

  if (qty != null && retail != null && total != null && !approxEqual(qty * retail, total)) {
    messages.push(`Quantity × retail does not match total (${qty * retail} vs ${total})`);
    status = "warning";
  }

  row.validationStatus = status;
  row.validationMessages = messages;
  return finalizeRow(row, ctx.fx);
}

export function parseHairProductsMixedRow(cells: unknown[], ctx: ParseContext): ParsedInventoryImportRow {
  const raw: InventoryImportRawCells = {
    sub_list: cellString(cells[0]),
    product_name: cellString(cells[1]),
    quantity: cellString(cells[2]),
    retail_col_d: parseNumericCell(cells[3]),
    rate_col_e: parseNumericCell(cells[4]),
    total_ngn: parseNumericCell(cells[5]),
  };
  const row = baseRow(ctx, "hair_products_mixed", raw);
  row.productName = raw.product_name as string;
  row.sectionNote = (raw.sub_list as string) || ctx.sectionNote;

  const { qty, unit } = parseQuantityCell(cells[2]);
  row.quantity = qty;
  row.unit = unit;

  const colD = raw.retail_col_d as number | null;
  const rate = raw.rate_col_e as number | null;
  const total = raw.total_ngn as number | null;

  const messages: string[] = [];
  let status: InventoryImportValidationStatus = "needs_review";
  let retailMajor: number | null = null;

  if (qty != null && qty > 0 && rate != null && total != null) {
    if (approxEqual(qty * rate, total)) {
      retailMajor = rate;
      status = "ok";
      messages.push("Matched: quantity × Rate = Total (Rate treated as per-pack retail NGN)");
    } else if (approxEqual(rate, total)) {
      retailMajor = total / qty;
      status = "ok";
      messages.push("Matched: Rate = Total; unit retail derived as Total ÷ quantity");
    } else if (colD != null && approxEqual(qty * colD, total)) {
      retailMajor = colD;
      status = "warning";
      messages.push("Matched: quantity × Retail(col D) = Total; col D used as unit retail (col E ignored)");
    } else {
      messages.push(
        `Pricing math inconsistent — qty×Rate=${qty * rate}, Rate=${rate}, Total=${total}, Retail(col D)=${colD}. Owner must resolve in preview.`,
      );
      status = "needs_review";
    }
  } else {
    messages.push("Missing quantity, Rate, or Total — cannot validate pricing");
    status = "error";
  }

  row.retailNgnMajor = retailMajor;
  row.validationStatus = status;
  row.validationMessages = messages;
  return finalizeRow(row, ctx.fx);
}

export function parseEquipmentLumpRow(cells: unknown[], ctx: ParseContext): ParsedInventoryImportRow {
  let retail = parseNumericCell(cells[2]);
  let total = parseNumericCell(cells[3]);
  let qty = 1;

  // Some rows put qty in col C and retail in col D (e.g. Industrial Machine: 1, 680000)
  if (retail != null && total != null && retail <= 100 && total > retail * 50) {
    qty = retail;
    retail = total;
    total = total;
  }

  const raw: InventoryImportRawCells = {
    sn: cellString(cells[0]),
    product_name: cellString(cells[1]),
    retail_ngn: retail,
    total_ngn: total,
  };
  const row = baseRow(ctx, "equipment_lump", raw);
  row.productName = raw.product_name as string;
  row.quantity = qty;
  row.unit = "each";
  row.retailNgnMajor = retail;

  const messages: string[] = [];
  let status: InventoryImportValidationStatus = "ok";

  if (retail != null && total != null && !approxEqual(retail, total)) {
    messages.push(`Retail (${retail}) does not match total (${total}) for lump-sum item`);
    status = "warning";
  }

  row.validationStatus = status;
  row.validationMessages = messages;
  return finalizeRow(row, ctx.fx);
}

export function parseCartonRow(cells: unknown[], ctx: ParseContext): ParsedInventoryImportRow {
  const raw: InventoryImportRawCells = {
    product_name: cellString(cells[0]),
    value_col_b: parseNumericCell(cells[1]),
    num_cartons: parseNumericCell(cells[2]),
    total_col_d: parseNumericCell(cells[3]),
  };
  const row = baseRow(ctx, "carton", raw);
  row.productName = raw.product_name as string;
  row.requiresOwnerConfirmation = true;

  const perCartonNgn = raw.value_col_b as number | null;
  const cartons = raw.num_cartons as number | null;
  const totalCol = raw.total_col_d as number | null;

  row.quantity = cartons;
  row.unit = "carton";
  row.retailNgnMajor = perCartonNgn;

  const messages: string[] = [
    "Carton sheet: default interpretation is qty = number of cartons, retail = NGN per carton. Confirm before import.",
  ];
  const status: InventoryImportValidationStatus = "needs_review";

  if (perCartonNgn != null && cartons != null && totalCol != null) {
    if (approxEqual(perCartonNgn * cartons, totalCol)) {
      messages.push(
        `Col D (${totalCol}) equals cartons × col B (${perCartonNgn}×${cartons}) — likely total NGN value, NOT unit count`,
      );
    } else {
      messages.push(`Col B × cartons (${perCartonNgn}×${cartons}) ≠ col D (${totalCol}) — verify column labels with owner`);
    }
  }

  row.validationStatus = status;
  row.validationMessages = messages;
  return finalizeRow(row, ctx.fx);
}

export function detectProfileForSheet(sheetName: string): InventoryImportParserProfile {
  const n = sheetName.trim();
  if (n === "Makeup Products") return "makeup_retail";
  if (n === "List of Hair Products") return "hair_products_mixed";
  // Dummy Heads sheet is excluded from EXPECTED_IMPORT_CATEGORIES — never parsed.
  return "standard_retail";
}

export function parseRowWithProfile(
  profile: InventoryImportParserProfile,
  cells: unknown[],
  ctx: ParseContext,
): ParsedInventoryImportRow | null {
  if (profile === "standard_retail") return parseStandardRetailRow(cells, ctx);
  if (profile === "makeup_retail") return parseMakeupRetailRow(cells, ctx);
  if (profile === "hair_products_mixed") return parseHairProductsMixedRow(cells, ctx);
  if (profile === "equipment_lump") return parseEquipmentLumpRow(cells, ctx);
  if (profile === "carton") return parseCartonRow(cells, ctx);
  return null;
}

export { isEquipmentLumpHeader };
