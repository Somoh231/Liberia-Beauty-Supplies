import { existsSync } from "node:fs";
import { join } from "node:path";
import { requireAdminContext } from "@/lib/auth/admin-context";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

const LOGO_PUBLIC_PATH = "/brand/liberia-beauty-logo.png";

function resolveLogoSrc(): string | null {
  try {
    return existsSync(join(process.cwd(), "public", "brand", "liberia-beauty-logo.png")) ? LOGO_PUBLIC_PATH : null;
  } catch {
    return null;
  }
}

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdminContext();
  const logoSrc = resolveLogoSrc();

  return (
    <AdminShell
      email={ctx.user.email ?? ""}
      fullName={ctx.fullName}
      roleSlug={ctx.roleSlug}
      logoSrc={logoSrc}
    >
      {children}
    </AdminShell>
  );
}
