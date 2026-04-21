/** Canonical branding — use across metadata, header, and footer. */
export const SITE_NAME = "Liberian Beauty Salon & Supplies";
export const SITE_NAME_LINE = "Liberian Beauty";
export const SITE_TAGLINE = "Salon & Supplies";
export const CONTACT_EMAIL = "hello@liberianbeautysalon.com";
export const INSTAGRAM_HANDLE = "liberianbeautysalon";
export const STUDIO_ADDRESS_LINE = "Tubman Boulevard, Monrovia";

/** Google Maps deep links (search + directions). */
const STUDIO_MAPS_QUERY = `${STUDIO_ADDRESS_LINE}, Liberia`;
export const STUDIO_MAPS_LABEL = STUDIO_ADDRESS_LINE;
export const STUDIO_MAPS_OPEN_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STUDIO_MAPS_QUERY)}`;
export const STUDIO_MAPS_DIRECTIONS_HREF = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(STUDIO_MAPS_QUERY)}`;

/** Contact primitives (Liberia-friendly, WhatsApp-first). */
export const STUDIO_PHONE_DISPLAY = "+231 77 000 0000";
export const STUDIO_PHONE_E164 = "+231770000000";
export const WHATSAPP_E164 = STUDIO_PHONE_E164;

export const STUDIO_HOURS_SHORT = "Tue–Sat 9:00–19:00";
export const STUDIO_HOURS_LONG =
  "Tuesday–Saturday 9:00 AM–7:00 PM · Sunday & Monday by appointment";

export const GOOGLE_MAPS_PLACEHOLDER_HREF = STUDIO_MAPS_OPEN_HREF;
