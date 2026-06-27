/* eslint-disable @next/next/no-page-custom-font -- Google Fonts via `<link>` in App Router root layout; avoids breaking Tailwind with a remote `@import` in CSS. */
import type { Metadata } from "next";
import "./globals.css";

/** Typography: CSS variables in `globals.css`. Google Fonts load here via `<link>` (browser only) so
 *  PostCSS/Tailwind never has to parse a remote `@import` (that can drop the whole stylesheet). We avoid
 *  `next/font/google` in the root layout because it has caused hard 500s when server-side font setup failed. */

export const metadata: Metadata = {
  title: {
    default: "Liberian Beauty Salon & Supplies",
    template: "%s · Liberian Beauty Salon & Supplies",
  },
  description:
    "Luxury Monrovia beauty studio — hair, braids, nails, makeup, wig installs, and curated professional supplies. Book online.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Poppins:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
