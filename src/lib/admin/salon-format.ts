export type SalonCurrency = "USD" | "LRD" | "NGN";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function getMonroviaDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Monrovia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Inclusive UTC window matching `fetchTodayRevenueSnapshot` (Monrovia calendar day). */
export function monroviaDayUtcWindow(dayKey: string): { startIso: string; endIso: string } {
  return { startIso: `${dayKey}T00:00:00.000Z`, endIso: `${dayKey}T23:59:59.999Z` };
}

export function formatSalonMoney(minorUnits: number, currency: SalonCurrency): string {
  const locale =
    currency === "USD" ? "en-US" : currency === "NGN" ? "en-NG" : "en-LR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / 100);
}

/** Parse major units (e.g. 9500 NGN) to minor (kobo / cents). */
export function parseMoneyToCents(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function parseQty(raw: string | number | undefined | null): number | null {
  if (raw === "" || raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function normalizeCurrency(raw: string | undefined | null): SalonCurrency {
  const u = (raw ?? "NGN").toUpperCase();
  if (u === "USD" || u === "LRD" || u === "LD" || u === "NGN") return u === "LD" ? "LRD" : u;
  return "NGN";
}

/** Display label for LRD in UI (ISO code remains LRD in DB). */
export function currencyShortLabel(c: SalonCurrency): string {
  if (c === "LRD") return "LD";
  return c;
}
