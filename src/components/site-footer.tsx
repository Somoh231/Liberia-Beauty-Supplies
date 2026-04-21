import { HardNavLink } from "@/components/marketing/hard-nav-link";
import { STAFF_LOGIN_PATH } from "@/lib/auth/safe-admin-next";
import { Container } from "@/components/ui/container";
import {
  CONTACT_EMAIL,
  GOOGLE_MAPS_PLACEHOLDER_HREF,
  INSTAGRAM_HANDLE,
  SITE_NAME,
  STUDIO_ADDRESS_LINE,
  STUDIO_HOURS_LONG,
  STUDIO_HOURS_SHORT,
  STUDIO_PHONE_DISPLAY,
  WHATSAPP_E164,
} from "@/lib/site";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/[0.06] bg-[#111111] text-[#FAF7F2]/92">
      <div className="pointer-events-none h-px w-full bg-gradient-to-r from-transparent via-[#D4AF37]/45 to-transparent" aria-hidden />
      <Container className="py-14 sm:py-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_0.65fr_0.65fr_0.65fr] lg:gap-12">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#D4AF37]">{SITE_NAME}</p>
            <p className="mt-3 font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[#FAF7F2] sm:text-3xl">
              Premium care · Curated supplies
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[#FAF7F2]/58">
              {STUDIO_ADDRESS_LINE}
            </p>
            <p className="mt-2 text-sm text-[#D4AF37]/90">{STUDIO_HOURS_SHORT}</p>
            <p className="mt-1 text-xs leading-relaxed text-[#FAF7F2]/45">{STUDIO_HOURS_LONG}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <a
                href={`https://wa.me/${WHATSAPP_E164.replace("+", "")}`}
                className="rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 py-2 text-[12px] text-[#FAF7F2]/88 transition duration-200 hover:border-[#D4AF37]/55 hover:bg-[#D4AF37]/16"
              >
                WhatsApp
              </a>
              <a
                href={`tel:${WHATSAPP_E164}`}
                className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] text-[#FAF7F2]/78 transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                Call {STUDIO_PHONE_DISPLAY}
              </a>
              <a
                href={GOOGLE_MAPS_PLACEHOLDER_HREF}
                className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] text-[#FAF7F2]/78 transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                Map & directions
              </a>
              <a
                href={`https://www.instagram.com/${INSTAGRAM_HANDLE}/`}
                className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[12px] text-[#FAF7F2]/78 transition hover:border-white/20 hover:bg-white/[0.07]"
                rel="noopener noreferrer"
                target="_blank"
              >
                Instagram
              </a>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#FAF7F2]/48">Explore</p>
            <div className="flex flex-col gap-2">
              <Link href="/services" className="text-[#FAF7F2]/62 transition hover:text-[#D4AF37]">
                Services
              </Link>
              <Link href="/gallery" className="text-[#FAF7F2]/62 transition hover:text-[#D4AF37]">
                Gallery
              </Link>
              <Link href="/about" className="text-[#FAF7F2]/62 transition hover:text-[#D4AF37]">
                About
              </Link>
              <Link href="/contact" className="text-[#FAF7F2]/62 transition hover:text-[#D4AF37]">
                Contact
              </Link>
              <Link href="/book" className="text-[#FAF7F2]/62 transition hover:text-[#D4AF37]">
                Book
              </Link>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#FAF7F2]/48">Visit</p>
            <div className="flex flex-col gap-2 text-[#FAF7F2]/62">
              <span>{STUDIO_ADDRESS_LINE}</span>
              <span>{STUDIO_HOURS_SHORT}</span>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#FAF7F2]/48">Staff</p>
            <div className="flex flex-col gap-2">
              <HardNavLink href={STAFF_LOGIN_PATH} className="text-[#FAF7F2]/62 transition hover:text-[#D4AF37]">
                Staff login
              </HardNavLink>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#FAF7F2]/62 transition hover:text-[#D4AF37]">
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>
        </div>

        <p className="mt-12 text-xs text-[#FAF7F2]/32">© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
      </Container>
    </footer>
  );
}
