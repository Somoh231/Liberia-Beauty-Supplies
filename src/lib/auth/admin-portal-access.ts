import { normalizeSalonRole, type SalonRole } from "@/lib/auth/admin-roles";

export type PortalProfileGate = {
  role: string;
  active: boolean;
};

/** Pure read-path check — no RPC, no writes. */
export function isPortalProfileAllowed(profile: PortalProfileGate | null | undefined): profile is PortalProfileGate & {
  role: SalonRole;
} {
  if (!profile?.active) return false;
  const role = normalizeSalonRole(profile.role);
  return role === "owner" || role === "manager" || role === "staff";
}
