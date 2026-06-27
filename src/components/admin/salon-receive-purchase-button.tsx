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
      className="admin-btn-secondary rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] disabled:opacity-50"
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
