import { requireAdminContext } from "@/lib/auth/admin-context";
import { AdminChrome } from "@/components/admin/admin-chrome";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAdminContext();

  return (
    <div className="flex min-h-full flex-col">
      <AdminChrome
        email={ctx.user.email ?? ""}
        roleSlug={ctx.roleSlug}
        showOpsTrustLinks={ctx.isManagerOrAbove}
        showUsersLink={ctx.isOwner}
      />
      <main className="flex-1 scroll-smooth px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 sm:px-8 sm:pb-10 sm:pt-12 lg:px-10">
        {children}
      </main>
    </div>
  );
}
