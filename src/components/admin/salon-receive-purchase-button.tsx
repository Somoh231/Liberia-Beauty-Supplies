"use client";

import { receivePurchaseAction } from "@/app/actions/admin-salon";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SalonReceivePurchaseButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-full border border-[var(--admin-accent)]/45 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-accent)] disabled:opacity-50"
      onClick={() => {
        start(async () => {
          await receivePurchaseAction({ purchaseId });
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "Receive shipment"}
    </button>
  );
}
