"use server";

import { sendBookingCreatedEmails } from "@/lib/email/booking-notifications";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  computeSlotsSimple,
  fetchBookingsOverlappingDay,
  isDateInBookableRange,
  isValidSlotChoice,
  loadStylistUnrestricted,
  salonDayBoundsUtc,
} from "@/lib/booking/availability";
import type { BookingSummaryDTO, ServiceDTO, SlotDTO, StylistDTO } from "@/lib/booking/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function simpleEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export type WizardDataResult =
  | { ok: true; services: ServiceDTO[]; stylists: StylistDTO[] }
  | { ok: false; error: "missing_env" | "fetch_failed" };

export async function getBookingWizardData(): Promise<WizardDataResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "missing_env" };
  }

  const [{ data: servicesRaw, error: sErr }, { data: stylistsRaw, error: stErr }, unrestricted] =
    await Promise.all([
      supabase.from("services").select("id,name,description,duration_minutes,price_cents").eq("active", true).order("sort_order"),
      supabase.from("stylists").select("id,name,title").eq("active", true).order("sort_order"),
      loadStylistUnrestricted(supabase),
    ]);

  if (sErr || stErr) {
    return { ok: false, error: "fetch_failed" };
  }

  const serviceRows = (servicesRaw ?? []) as {
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price_cents: number | null;
  }[];

  const stylistRows = (stylistsRaw ?? []) as { id: string; name: string; title: string | null }[];

  let pairs: { stylist_id: string; service_id: string }[] = [];
  if (!unrestricted) {
    const { data: ss } = await supabase.from("stylist_services").select("stylist_id,service_id");
    pairs = (ss ?? []) as { stylist_id: string; service_id: string }[];
  }

  const services: ServiceDTO[] = serviceRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    durationMinutes: r.duration_minutes,
    priceCents: r.price_cents,
  }));

  const allServiceIds = services.map((s) => s.id);

  const stylists: StylistDTO[] = stylistRows.map((r) => {
    const mine = pairs.filter((p) => p.stylist_id === r.id).map((p) => p.service_id);
    const serviceIds = unrestricted ? allServiceIds : mine;
    return {
      id: r.id,
      name: r.name,
      title: r.title,
      serviceIds,
    };
  });

  return { ok: true, services, stylists };
}

export type SlotsResult =
  | { ok: true; slots: SlotDTO[] }
  | { ok: false; error: string };

export async function getAvailableSlotsAction(input: {
  serviceId: string;
  stylistId: string | null;
  dateStr: string;
}): Promise<SlotsResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "missing_env" };
  }
  if (!isDateInBookableRange(input.dateStr)) {
    return { ok: false, error: "invalid_date" };
  }

  const unrestricted = await loadStylistUnrestricted(supabase);
  const service = await supabase
    .from("services")
    .select("id,name,description,duration_minutes,price_cents")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (service.error || !service.data) {
    return { ok: false, error: "invalid_service" };
  }

  const s = service.data as {
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price_cents: number | null;
  };

  const serviceDTO: ServiceDTO = {
    id: s.id,
    name: s.name,
    description: s.description,
    durationMinutes: s.duration_minutes,
    priceCents: s.price_cents,
  };

  const { data: stylistRaw } = await supabase
    .from("stylists")
    .select("id,name,title")
    .eq("active", true)
    .order("sort_order");

  const stylistRows = (stylistRaw ?? []) as { id: string; name: string; title: string | null }[];

  let pairs: { stylist_id: string; service_id: string }[] = [];
  if (!unrestricted) {
    const { data: ss } = await supabase.from("stylist_services").select("stylist_id,service_id");
    pairs = (ss ?? []) as { stylist_id: string; service_id: string }[];
  }

  const allServiceIds = (
    await supabase.from("services").select("id").eq("active", true)
  ).data?.map((r) => (r as { id: string }).id) ?? [];

  const stylists: StylistDTO[] = stylistRows.map((r) => {
    const mine = pairs.filter((p) => p.stylist_id === r.id).map((p) => p.service_id);
    const serviceIds = unrestricted ? allServiceIds : mine;
    return { id: r.id, name: r.name, title: r.title, serviceIds };
  });

  const bounds = salonDayBoundsUtc(input.dateStr);
  if (!bounds) {
    return { ok: false, error: "invalid_date" };
  }

  const eligibleIds = stylists
    .filter((st) => {
      if (input.stylistId && st.id !== input.stylistId) return false;
      if (unrestricted || st.serviceIds.length === 0) return true;
      return st.serviceIds.includes(input.serviceId);
    })
    .map((st) => st.id);

  const existing = await fetchBookingsOverlappingDay(supabase, eligibleIds, bounds.open, bounds.close);
  const slots = computeSlotsSimple({
    dateStr: input.dateStr,
    service: serviceDTO,
    stylists,
    stylistId: input.stylistId,
    unrestricted,
    existing,
  });

  return { ok: true, slots };
}

export type CreateBookingResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: "missing_env" | "invalid_input" | "slot_unavailable" | "stylist_invalid" | "unknown" };

export async function createBookingAction(input: {
  serviceId: string;
  stylistId: string | null;
  dateStr: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
}): Promise<CreateBookingResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "missing_env" };
  }

  const name = input.customerName?.trim() ?? "";
  const phone = input.customerPhone?.trim() ?? "";
  const email = normalizeEmail(input.customerEmail ?? "");
  const notes = input.notes?.trim() ?? "";

  if (name.length < 2 || phone.length < 5 || !simpleEmailValid(email)) {
    return { ok: false, error: "invalid_input" };
  }

  if (!isDateInBookableRange(input.dateStr)) {
    return { ok: false, error: "invalid_input" };
  }

  const { data: svc, error: svcErr } = await supabase
    .from("services")
    .select("id,duration_minutes")
    .eq("id", input.serviceId)
    .eq("active", true)
    .maybeSingle();

  if (svcErr || !svc) {
    return { ok: false, error: "invalid_input" };
  }

  const duration = (svc as { duration_minutes: number }).duration_minutes;
  if (!isValidSlotChoice(input.startsAt, input.dateStr, duration)) {
    return { ok: false, error: "invalid_input" };
  }

  const slotsResult = await getAvailableSlotsAction({
    serviceId: input.serviceId,
    stylistId: input.stylistId,
    dateStr: input.dateStr,
  });

  if (!slotsResult.ok) {
    return { ok: false, error: "invalid_input" };
  }

  const stillOpen = slotsResult.slots.some((s) => s.startsAt === input.startsAt);
  if (!stillOpen) {
    return { ok: false, error: "slot_unavailable" };
  }

  const { data, error } = await supabase.rpc("create_booking_atomic", {
    p_service_id: input.serviceId,
    p_stylist_id: input.stylistId,
    p_starts_at: input.startsAt,
    p_customer_name: name,
    p_customer_phone: phone,
    p_customer_email: email,
    p_notes: notes.length ? notes : null,
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("slot_unavailable") || error.code === "23P01" || error.code === "P0001") {
      return { ok: false, error: "slot_unavailable" };
    }
    if (msg.includes("stylist_invalid") || msg.includes("invalid_service")) {
      return { ok: false, error: "stylist_invalid" };
    }
    if (msg.includes("invalid_input")) {
      return { ok: false, error: "invalid_input" };
    }
    return { ok: false, error: "unknown" };
  }

  const bookingId = data as string;
  if (!bookingId || !UUID_RE.test(bookingId)) {
    return { ok: false, error: "unknown" };
  }

  try {
    await sendBookingCreatedEmails(supabase, bookingId);
  } catch (e) {
    console.error("[booking] post-create email failed:", e instanceof Error ? e.message : e);
  }

  return { ok: true, bookingId };
}

export type BookingSummaryResult =
  | { ok: true; booking: BookingSummaryDTO }
  | { ok: false; error: string };

export async function getBookingSummaryAction(id: string): Promise<BookingSummaryResult> {
  if (!UUID_RE.test(id)) {
    return { ok: false, error: "not_found" };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "missing_env" };
  }

  const { data: row, error } = await supabase
    .from("bookings")
    .select("id, customer_name, starts_at, ends_at, service_id, stylist_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, error: "not_found" };
  }

  const b = row as {
    id: string;
    customer_name: string;
    starts_at: string;
    ends_at: string;
    service_id: string;
    stylist_id: string;
  };

  const [{ data: svc }, { data: st }] = await Promise.all([
    supabase.from("services").select("name").eq("id", b.service_id).maybeSingle(),
    supabase.from("stylists").select("name").eq("id", b.stylist_id).maybeSingle(),
  ]);

  const serviceName = (svc as { name: string } | null)?.name;
  const stylistName = (st as { name: string } | null)?.name;

  if (!serviceName || !stylistName) {
    return { ok: false, error: "not_found" };
  }

  return {
    ok: true,
    booking: {
      id: b.id,
      customerName: b.customer_name,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      serviceName,
      stylistName,
    },
  };
}
