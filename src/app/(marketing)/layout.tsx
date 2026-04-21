import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#site-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-[#D4AF37] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-[#111111] focus:shadow-lg"
      >
        Skip to main content
      </a>
      <SiteHeader />
      <main id="site-main" className="flex-1 pb-[max(0px,env(safe-area-inset-bottom))]" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

