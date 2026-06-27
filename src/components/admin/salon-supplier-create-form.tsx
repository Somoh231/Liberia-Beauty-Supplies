"use client";

import { createSupplierAction } from "@/app/actions/admin-salon";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const field =
  "mt-1.5 w-full rounded-xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white placeholder:text-white/35 focus:border-[var(--admin-accent)]/45 focus:outline-none focus:ring-1 focus:ring-[var(--admin-accent)]/30";

export function SalonSupplierCreateForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function toUserFacingErrorMessage(code: string): string {
    switch (code) {
      case "invalid_name":
        return "Missing or invalid supplier name.";
      case "duplicate_supplier":
        return "That supplier already exists.";
      case "permission_denied":
        return "You do not have permission to create suppliers.";
      case "db_insert_failed":
        return "Could not create supplier. Please try again.";
      default:
        return code.replace(/_/g, " ");
    }
  }

  return (
    <form
      className="admin-card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await createSupplierAction({
            name: String(fd.get("name") ?? ""),
            contactName: String(fd.get("contact") ?? "") || null,
            email: String(fd.get("email") ?? "") || null,
            phone: String(fd.get("phone") ?? "") || null,
            countryOrigin: String(fd.get("country") ?? "") || "Nigeria",
            notes: String(fd.get("notes") ?? "") || null,
            productCategory: String(fd.get("product_category") ?? "") || null,
          });
          if (!r.ok) {
            setErr(toUserFacingErrorMessage(r.error));
            return;
          }
          e.currentTarget.reset();
          router.refresh();
        });
      }}
    >
      {err ? <p className="text-xs text-red-300">{err}</p> : null}
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Add supplier</p>
      <input name="name" required placeholder="Supplier name" className={field} />
      <input name="contact" placeholder="Contact person" className={field} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="phone" placeholder="Phone" className={field} />
        <input name="email" type="email" placeholder="Email" className={field} />
      </div>
      <input name="country" placeholder="Country (default Nigeria)" className={field} defaultValue="Nigeria" />
      <input name="product_category" placeholder="Product category (e.g. Hair extensions)" className={field} />
      <input name="notes" placeholder="Notes" className={field} />
      <button
        type="submit"
        disabled={pending}
        className="admin-btn-primary rounded-full px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-50"
      >
        {pending ? "…" : "Add"}
      </button>
    </form>
  );
}
