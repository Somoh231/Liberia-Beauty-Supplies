"use client";

import {
  createSalonUserAction,
  resetSalonUserPasswordAction,
  setSalonUserActiveAction,
  updateSalonUserRoleAction,
  type UserProfileRow,
} from "@/app/actions/admin-users";
import { roleBadgeLabel } from "@/lib/auth/admin-roles";
import { cn } from "@/lib/utils";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function roleBadgeCls(role: UserProfileRow["role"]) {
  if (role === "owner") return "bg-[var(--admin-accent-dim)] text-[var(--admin-accent)] ring-[var(--admin-accent)]/35";
  if (role === "manager") return "bg-violet-500/10 text-violet-200/90 ring-violet-400/25";
  return "bg-white/[0.06] text-white/55 ring-white/10";
}

function errLabel(code: string): string {
  return code.replace(/_/g, " ");
}

export function SalonUsersPanel({ users, currentUserId }: { users: UserProfileRow[]; currentUserId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q) ||
        u.role.includes(q),
    );
  }, [users, search]);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <UsersPanelMain
        currentUserId={currentUserId}
        filtered={filtered}
        pending={pending}
        resetUserId={resetUserId}
        rowErr={rowErr}
        router={router}
        search={search}
        setResetUserId={setResetUserId}
        setRowErr={setRowErr}
        setSearch={setSearch}
        start={start}
      />
      <UsersPanelCreate formErr={formErr} pending={pending} router={router} setFormErr={setFormErr} start={start} />
    </div>
  );
}

function UsersPanelMain(props: {
  currentUserId: string;
  filtered: UserProfileRow[];
  pending: boolean;
  resetUserId: string | null;
  rowErr: string | null;
  router: ReturnType<typeof useRouter>;
  search: string;
  setResetUserId: (v: string | null) => void;
  setRowErr: (v: string | null) => void;
  setSearch: (v: string) => void;
  start: ReturnType<typeof useTransition>[1];
}) {
  const {
    currentUserId,
    filtered,
    pending,
    resetUserId,
    rowErr,
    router,
    search,
    setResetUserId,
    setRowErr,
    setSearch,
    start,
  } = props;

  return (
    <div className="space-y-4">
      <label className="block text-xs text-white/55">
        Search users
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Email, name, or role"
          className={field}
        />
      </label>

      {rowErr ? <p className="text-sm text-red-300">{errLabel(rowErr)}</p> : null}

      <div className="admin-card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-white/[0.06] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{u.full_name ?? "—"}</p>
                  <p className="text-xs text-white/45">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-xs uppercase tracking-wide text-white"
                    value={u.role}
                    disabled={pending || u.id === currentUserId}
                    onChange={(e) => {
                      setRowErr(null);
                      start(async () => {
                        const r = await updateSalonUserRoleAction({ userId: u.id, role: e.target.value });
                        if (!r.ok) {
                          setRowErr(r.error);
                          return;
                        }
                        router.refresh();
                      });
                    }}
                  >
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                  <span
                    className={cn(
                      "ml-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] ring-1",
                      roleBadgeCls(u.role),
                    )}
                  >
                    {roleBadgeLabel(u.role)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
                      u.active
                        ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                        : "bg-red-500/15 text-red-100 ring-red-500/35",
                    )}
                  >
                    {u.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-white/50">{fmtWhen(u.created_at)}</td>
                <td className="px-4 py-3 text-xs text-white/50">{fmtWhen(u.last_login_at)}</td>
                <td className="px-4 py-3">
                  <UserRowActions
                    currentUserId={currentUserId}
                    pending={pending}
                    resetUserId={resetUserId}
                    router={router}
                    setResetUserId={setResetUserId}
                    setRowErr={setRowErr}
                    start={start}
                    u={u}
                  />
                </td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-white/45">
                  No users match your search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersPanelCreate({
  formErr,
  pending,
  router,
  setFormErr,
  start,
}: {
  formErr: string | null;
  pending: boolean;
  router: ReturnType<typeof useRouter>;
  setFormErr: (v: string | null) => void;
  start: ReturnType<typeof useTransition>[1];
}) {
  return (
    <form
      className="admin-card h-fit space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setFormErr(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createSalonUserAction({
            fullName: String(fd.get("full_name") ?? ""),
            email: String(fd.get("email") ?? ""),
            password: String(fd.get("password") ?? ""),
            role: String(fd.get("role") ?? "staff"),
          });
          if (!r.ok) {
            setFormErr(r.error);
            return;
          }
          e.currentTarget.reset();
          router.refresh();
        });
      }}
    >
      {formErr ? <p className="text-xs text-red-300">{errLabel(formErr)}</p> : null}
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Create user</p>
      <input name="full_name" required placeholder="Full name" className={field} />
      <input name="email" type="email" required placeholder="Email" className={field} autoComplete="off" />
      <input
        name="password"
        type="password"
        required
        minLength={8}
        placeholder="Temporary password (min 8 chars)"
        className={field}
        autoComplete="new-password"
      />
      <label className="block text-xs text-white/55">
        Role
        <select name="role" defaultValue="staff" className={field}>
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-[var(--admin-accent)] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-black disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create account"}
      </button>
      <p className="text-[11px] leading-relaxed text-white/40">
        Accounts are provisioned internally only. No public signup. Share the temporary password securely with the team
        member.
      </p>
    </form>
  );
}

function UserRowActions({
  u,
  currentUserId,
  pending,
  resetUserId,
  setResetUserId,
  setRowErr,
  start,
  router,
}: {
  u: UserProfileRow;
  currentUserId: string;
  pending: boolean;
  resetUserId: string | null;
  setResetUserId: (v: string | null) => void;
  setRowErr: (v: string | null) => void;
  start: ReturnType<typeof useTransition>[1];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={pending || u.id === currentUserId}
        className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70 hover:bg-white/[0.06] disabled:opacity-40"
        onClick={() => {
          setRowErr(null);
          start(async () => {
            const r = await setSalonUserActiveAction({ userId: u.id, active: !u.active });
            if (!r.ok) {
              setRowErr(r.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {u.active ? "Deactivate" : "Activate"}
      </button>
      <button
        type="button"
        disabled={pending}
        className="rounded-full border border-[var(--admin-accent)]/35 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)] hover:bg-[var(--admin-accent-dim)] disabled:opacity-40"
        onClick={() => setResetUserId(resetUserId === u.id ? null : u.id)}
      >
        Reset password
      </button>
      {resetUserId === u.id ? (
        <form
          className="mt-2 w-full space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setRowErr(null);
            const fd = new FormData(e.currentTarget);
            start(async () => {
              const r = await resetSalonUserPasswordAction({
                userId: u.id,
                password: String(fd.get("password") ?? ""),
              });
              if (!r.ok) {
                setRowErr(r.error);
                return;
              }
              setResetUserId(null);
              e.currentTarget.reset();
            });
          }}
        >
          <input
            name="password"
            type="password"
            minLength={8}
            required
            placeholder="New password"
            className={field}
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-50"
          >
            Save password
          </button>
        </form>
      ) : null}
    </div>
  );
}
