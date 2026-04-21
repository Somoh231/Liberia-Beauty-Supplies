/** Shared context for booking-related templates (public + internal). */
export type BookingEmailContext = {
  bookingId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  stylistName: string;
  startsAtIso: string;
  endsAtIso: string;
  notes: string | null;
  /** Human-readable window, e.g. "Tue, Apr 22, 2025 · 2:30 PM – 4:00 PM (GMT / Monrovia civil)" */
  scheduleSummary: string;
};
