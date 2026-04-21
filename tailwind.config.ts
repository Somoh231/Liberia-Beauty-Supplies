import type { Config } from "tailwindcss";

/**
 * Tailwind v4 is driven mainly by `src/app/globals.css` (`@import`, `@source`, custom CSS).
 * This file documents content roots for editors / generators that look for a root config.
 */
const config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
} satisfies Config;

export default config;
