import type { Metadata } from "next";
import { HomeLanding } from "@/components/marketing/home-landing";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Monrovia luxury salon & beauty supplies",
  description: `Luxury hair, nails, makeup, and beauty supplies in Monrovia — ${SITE_NAME}. Book online.`,
};

export default function HomePage() {
  return <HomeLanding />;
}

