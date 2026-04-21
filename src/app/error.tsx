"use client";

import { ButtonLink } from "@/components/ui/button-link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Error</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-medium text-[var(--fg)] sm:text-3xl">
        Something went wrong
      </h1>
      <p className="mx-auto mt-4 max-w-md text-sm text-[var(--fg-muted)]">
        Please try again. If this keeps happening, contact the studio with the time it occurred.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-[2.75rem] items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--fg)]/[0.04] px-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--fg)] transition hover:bg-[var(--fg)]/[0.08]"
        >
          Try again
        </button>
        <ButtonLink href="/">Home</ButtonLink>
      </div>
      {error.digest ? (
        <p className="mt-8 font-mono text-[10px] text-[var(--fg-muted)]">Ref: {error.digest}</p>
      ) : null}
    </div>
  );
}
