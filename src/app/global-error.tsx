"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-[#070708] px-4 text-center text-[#f7f4ef] antialiased">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d4b896]">Application error</p>
        <h1 className="mt-3 text-xl font-medium">Please reload the page</h1>
        <p className="mt-3 max-w-sm text-sm text-white/55">{error.message || "An unexpected error occurred."}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-8 rounded-full border border-white/20 bg-white/[0.08] px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90 transition hover:bg-white/[0.12]"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
