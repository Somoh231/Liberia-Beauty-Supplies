/** Shared cell parsing and row classification for workbook import (Phase 1 — no DB writes). */

export function normalizeSheetName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function cellString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  return String(v).trim();
}

export function parseNumericCell(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseQuantityCell(v: unknown): { qty: number | null; unit: string } {
  if (v == null || v === "") return { qty: null, unit: "each" };
  if (typeof v === "number" && Number.isFinite(v)) {
    return { qty: v, unit: "each" };
  }
  const s = String(v).trim();
  const m = s.match(/^([\d.,]+)\s*(.*)$/i);
  if (!m) return { qty: null, unit: s || "each" };
  const qty = parseNumericCell(m[1]);
  const unit = (m[2] || "each").trim() || "each";
  return { qty, unit };
}

/** Product / label cell for catalog sheets is column B; fall back to A for single-column headers. */
export function productNameCell(cells: string[]): string {
  return (cells[1] ?? cells[0] ?? "").trim();
}

export function isSubtotalOrTotalRow(cells: string[]): boolean {
  const nameCol = productNameCell(cells);
  if (nameCol && /TOTAL/i.test(nameCol)) return true;
  // Hair products: GRAND TOTAL sometimes sits in a later financial column with empty name
  const joined = cells.map((c) => c.trim()).filter(Boolean).join(" ");
  if (/grand\s*total/i.test(joined) && !cells[1]?.trim()) return true;
  return false;
}

export function isHeaderRow(cells: string[]): boolean {
  const a = (cells[0] ?? "").trim();
  const b = (cells[1] ?? "").trim();
  // Repeated header rows restart a table block (multi-table sheets).
  if (/^s\/?n$/i.test(a) || /^s\/?n$/i.test(b)) return true;
  if (/^item\s*name$/i.test(a) || /^item\s*name$/i.test(b)) return true;

  const joined = cells.map((c) => c.toLowerCase()).join(" ");
  if (joined.includes("s/n") && (joined.includes("quantity") || joined.includes("retail"))) return true;
  if (a.toLowerCase() === "list" && joined.includes("hair products")) return true;
  if (joined.includes("item name") && joined.includes("retail")) return true;
  if (a.toLowerCase() === "item name" && joined.includes("carton")) return true;
  return false;
}

/** Secondary equipment block header inside multi-block sheets. */
export function isEquipmentLumpHeader(cells: string[]): boolean {
  const joined = cells.map((c) => c.toLowerCase()).join(" ");
  return joined.includes("item name") && joined.includes("retail rate") && !joined.includes("quantity");
}

export function approxEqual(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function normalizeProductKey(name: string, category: string): string {
  return `${category}::${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}
