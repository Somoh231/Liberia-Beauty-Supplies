import type { Metadata } from "next";
import Link from "next/link";
import { fetchSalonUserProfiles } from "@/app/actions/admin-users";
import { SalonUsersPanel } from "@/components/admin/salon-users-panel";
import { requireOwnerContext } from "@/lib/auth/admin-context";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const ctx = await requireOwnerContext();
  const users = await fetchSalonUserProfiles();

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-10">
      <Link href="/admin" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-accent)]">
        ← Dashboard
      </Link>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium text-white">User management</h1>
        <p className="mt-1 text-sm text-white/50">
          Owner-only provisioning — create accounts, assign roles, activate or deactivate access, and reset passwords.
        </p>
      </div>
      <SalonUsersPanel users={users} currentUserId={ctx.user.id} />
    </div>
  );
}
