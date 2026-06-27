import type { Metadata } from "next";
import { fetchSalonUserProfiles } from "@/app/actions/admin-users";
import { SalonUsersPanel } from "@/components/admin/salon-users-panel";
import { requireOwnerContext } from "@/lib/auth/admin-context";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const ctx = await requireOwnerContext();
  const users = await fetchSalonUserProfiles();

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-semibold leading-tight text-white">User management</h1>
        <p className="max-w-2xl text-sm text-white/50">
          Owner-only provisioning — create accounts, assign roles, activate or deactivate access, and reset passwords.
        </p>
      </header>
      <SalonUsersPanel users={users} currentUserId={ctx.user.id} />
    </div>
  );
}
