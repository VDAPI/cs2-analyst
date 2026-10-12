"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/client";

/** PL / EN segmented switch. Saves the cookie (and User.locale), then re-renders the page. */
export function LanguageSwitcher({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const t = useT();
  const current = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function choose(locale: Locale) {
    if (locale === current || busy) return;
    setBusy(true);
    try {
      await fetch("/api/user/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      document.documentElement.lang = locale;
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("language.title")}
      className={cn(
        "inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-3)] p-0.5",
        className
      )}
    >
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={busy}
            onClick={() => choose(locale)}
            title={t(`language.${locale}`)}
            className={cn(
              "rounded-md px-3 font-mono text-xs font-semibold uppercase transition-colors",
              size === "sm" ? "min-h-9 md:min-h-7" : "min-h-11 md:min-h-9",
              active
                ? "bg-[var(--accent)] text-[var(--on-accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
}
