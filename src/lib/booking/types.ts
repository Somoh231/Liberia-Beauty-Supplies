export type ServiceDTO = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number | null;
};

export type StylistDTO = {
  id: string;
  name: string;
  title: string | null;
  /** Empty means "all services" when the salon has no stylist_services rows. */
  serviceIds: string[];
};

export type SlotDTO = {
  startsAt: string;
  label: string;
};

export type BookingSummaryDTO = {
  id: string;
  customerName: string;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  stylistName: string;
};
