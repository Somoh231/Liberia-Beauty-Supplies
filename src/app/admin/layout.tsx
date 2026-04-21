import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <div
      data-app="admin"
      className="relative min-h-full overflow-x-hidden bg-[var(--admin-surface)] text-[var(--admin-fg)] antialiased selection:bg-[var(--admin-accent-dim)] selection:text-[var(--admin-fg)]"
    >
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 20% -10%, rgba(212, 184, 150, 0.09), transparent 55%),
            radial-gradient(ellipse 60% 45% at 100% 20%, rgba(120, 90, 140, 0.05), transparent 50%),
            radial-gradient(ellipse 70% 60% at 50% 100%, rgba(212, 184, 150, 0.04), transparent 45%),
            linear-gradient(180deg, #080809 0%, #050506 50%, #070708 100%)
          `,
        }}
      />
      {children}
      <Toaster
        className="print:hidden"
        richColors
        theme="dark"
        position="top-center"
        closeButton
        gap={10}
        toastOptions={{
          duration: 4200,
          classNames: {
            toast:
              "!border !border-[var(--admin-line)] !bg-[#101012]/95 !text-[var(--admin-fg)] !shadow-[var(--admin-shadow-soft)] backdrop-blur-xl",
            title: "!font-medium !tracking-tight !text-[var(--admin-fg)]",
            description: "!text-[13px] !text-[var(--admin-fg-muted)]",
            success: "!border-emerald-500/22",
            error: "!border-red-400/28",
          },
        }}
      />
    </div>
  );
}
