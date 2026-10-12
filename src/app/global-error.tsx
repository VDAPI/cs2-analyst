"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "@/styles/globals.css";

/** Last-resort error screen (replaces the root layout); reports to Sentry when set up. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pl">
      <body className="flex min-h-dvh items-center justify-center bg-[var(--canvas)] px-4 text-[var(--text-primary)]">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6 text-center">
          <h1 className="text-xl font-bold">Coś poszło nie tak</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Błąd został zapisany. Spróbuj jeszcze raz za chwilę.
          </p>
          {error.digest && (
            <p className="mt-2 font-mono text-xs text-[var(--text-tertiary)]">{error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)]"
          >
            Spróbuj ponownie
          </button>
        </div>
      </body>
    </html>
  );
}
