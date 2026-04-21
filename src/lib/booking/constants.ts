/** Liberia (Monrovia) observes GMT year-round — we store and display UTC civil clock. */
export const BOOKING_TIMEZONE_LABEL = "GMT (Monrovia)";

/** First bookable slot (minute of day, 0–1439). */
export const SALON_OPEN_MINUTE = 9 * 60;

/** Salon closes at this minute; last appointment must end by here. */
export const SALON_CLOSE_MINUTE = 18 * 60;

/** Grid step for offered start times (minutes). */
export const SLOT_STEP_MINUTES = 15;

/** How far ahead clients may book. */
export const MAX_BOOKING_DAYS_AHEAD = 60;
