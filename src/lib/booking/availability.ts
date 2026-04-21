import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_BOOKING_DAYS_AHEAD,
  SALON_CLOSE_MINUTE,
  SALON_OPEN_MINUTE,
  SLOT_STEP_MINUTES,
} from "./constants";
import type { ServiceDTO, SlotDTO, StylistDTO } from "./types";

export type BookingOverlapRow = {
  id: string;
  stylist_id: string;
  starts_at: string;
  ends_at: string;
};

function parseDayUtc(dateStr: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** Salon civil day in UTC (Monrovia = GMT). `open` = 09:00, `close` = 18:00 same day. */
export function salonDayBoundsUtc(dateStr: string): { open: Date; close: Date } | null {
  const p = parseDayUtc(dateStr);
  if (!p) return null;
  const open = new Date(
    Date.UTC(p.y, p.m - 1, p.d, Math.floor(SALON_OPEN_MINUTE / 60), SALON_OPEN_MINUTE % 60, 0, 0),
  );
  const close = new Date(
    Date.UTC(p.y, p.m - 1, p.d, Math.floor(SALON_CLOSE_MINUTE / 60), SALON_CLOSE_MINUTE % 60, 0, 0),
  );
  return { open, close };
}

export function formatSlotLabel(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-LR", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function overlapsHalfOpen(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0 < b1 && b0 < a1;
}

function stylistQualifies(stylist: StylistDTO, serviceId: string, unrestricted: boolean): boolean {
  if (unrestricted || stylist.serviceIds.length === 0) return true;
  return stylist.serviceIds.includes(serviceId);
}

function eligibleStylists(
  stylists: StylistDTO[],
  serviceId: string,
  stylistId: string | null,
  unrestricted: boolean,
): StylistDTO[] {
  const base = stylists.filter((s) => stylistQualifies(s, serviceId, unrestricted));
  if (stylistId) {
    return base.filter((s) => s.id === stylistId);
  }
  return base;
}

export async function loadStylistUnrestricted(supabase: SupabaseClient): Promise<boolean> {
  const { count, error } = await supabase
    .from("stylist_services")
    .select("*", { count: "exact", head: true });
  if (error) return true;
  return (count ?? 0) === 0;
}

export function computeSlotsSimple(params: {
  dateStr: string;
  service: ServiceDTO;
  stylists: StylistDTO[];
  stylistId: string | null;
  unrestricted: boolean;
  existing: Pick<BookingOverlapRow, "stylist_id" | "starts_at" | "ends_at">[];
}): SlotDTO[] {
  const bounds = salonDayBoundsUtc(params.dateStr);
  if (!bounds) return [];
  const { open, close } = bounds;
  const duration = params.service.durationMinutes;
  const eligible = eligibleStylists(params.stylists, params.service.id, params.stylistId, params.unrestricted);
  if (!eligible.length) return [];

  const closeLimitMs = close.getTime();
  const slots: SlotDTO[] = [];
  let cursor = open.getTime();

  while (cursor < closeLimitMs) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor + duration * 60_000);
    if (slotEnd.getTime() > closeLimitMs) break;

    const iso = slotStart.toISOString();
    const anyFree = eligible.some((stylist) => {
      const blocks = params.existing.filter((b) => b.stylist_id === stylist.id);
      return !blocks.some((b) =>
        overlapsHalfOpen(slotStart, slotEnd, new Date(b.starts_at), new Date(b.ends_at)),
      );
    });

    if (anyFree) {
      slots.push({ startsAt: iso, label: formatSlotLabel(iso) });
    }
    cursor += SLOT_STEP_MINUTES * 60_000;
  }

  return slots;
}

/** Bookings that overlap the salon window [open, close) for overlap checks. */
export async function fetchBookingsOverlappingDay(
  supabase: SupabaseClient,
  stylistIds: string[],
  open: Date,
  close: Date,
): Promise<BookingOverlapRow[]> {
  if (!stylistIds.length) return [];
  const openIso = open.toISOString();
  const closeIso = close.toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, stylist_id, starts_at, ends_at")
    .in("stylist_id", stylistIds)
    .neq("status", "cancelled")
    .gt("ends_at", openIso)
    .lt("starts_at", closeIso);
  if (error || !data) return [];
  return data as BookingOverlapRow[];
}

export function minBookableDateStrUtc(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

export function maxBookableDateStrUtc(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + MAX_BOOKING_DAYS_AHEAD);
  return d.toISOString().slice(0, 10);
}

export function isDateInBookableRange(dateStr: string): boolean {
  return dateStr >= minBookableDateStrUtc() && dateStr <= maxBookableDateStrUtc();
}

/** True if `startsAt` aligns to the slot grid and fits inside salon hours for the service. */
export function isValidSlotChoice(
  startsAtIso: string,
  dateStr: string,
  durationMinutes: number,
): boolean {
  const bounds = salonDayBoundsUtc(dateStr);
  if (!bounds) return false;
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  if (end.getTime() > bounds.close.getTime()) return false;
  if (start.getTime() < bounds.open.getTime()) return false;
  const delta = (start.getTime() - bounds.open.getTime()) / 60_000;
  if (delta % SLOT_STEP_MINUTES !== 0) return false;
  return true;
}
