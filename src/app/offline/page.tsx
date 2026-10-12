import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { RetryButton } from "./retry-button";

export const metadata: Metadata = { title: "Offline — CS2 Analyst" };

/** Shown by the service worker (public/sw.js) when a page can't load offline. */
export default async function OfflinePage() {
  const { t } = await getT();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
        <WifiOff className="h-7 w-7 text-[var(--accent)]" aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">{t("offline.title")}</h1>
      <p className="max-w-sm text-sm text-[var(--text-secondary)]">{t("offline.body")}</p>
      <RetryButton label={t("offline.retry")} />
    </main>
  );
}
