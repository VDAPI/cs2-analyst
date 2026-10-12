"use client";

import Link from "next/link";
import { ClipboardCheck, Eye, ListChecks, Link2, Upload, type LucideIcon } from "lucide-react";
import { Card, buttonVariants } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";

const STEPS: { icon: LucideIcon; title: MessageKey; body: MessageKey }[] = [
  { icon: Upload, title: "onboarding.start.step1Title", body: "onboarding.start.step1Body" },
  { icon: ListChecks, title: "onboarding.start.step2Title", body: "onboarding.start.step2Body" },
  { icon: ClipboardCheck, title: "onboarding.start.step3Title", body: "onboarding.start.step3Body" },
];

/**
 * Next steps for a player with nothing analysed yet (S21): upload a demo (the
 * one lime CTA), link FACEIT, or look at the public example report first.
 * Goes in an empty state's `action`.
 */
export function StartActions({
  faceit = true,
  upload = "cta",
}: {
  /** Offer linking FACEIT (off when it is linked, or on tools that only read demos). */
  faceit?: boolean;
  /** "primary" when the screen already has its lime CTA. */
  upload?: "cta" | "primary";
}) {
  const t = useT();
  return (
    <>
      <Link href="/upload" className={buttonVariants({ variant: upload })}>
        <Upload className="h-4 w-4" aria-hidden />
        {t("onboarding.start.upload")}
      </Link>
      {faceit && (
        <Link href="/settings" className={buttonVariants({ variant: "secondary" })}>
          <Link2 className="h-4 w-4" aria-hidden />
          {t("onboarding.start.faceit")}
        </Link>
      )}
      <Link href="/demo" className={buttonVariants({ variant: "ghost" })}>
        <Eye className="h-4 w-4" aria-hidden />
        {t("onboarding.start.example")}
      </Link>
    </>
  );
}

/**
 * The first screen of a new account (S21): what to do, in three steps, with
 * the actions right under them. Shown on /matches until the first match,
 * whose header already holds the lime "Wgraj demo".
 */
export function GettingStarted({ faceit = true }: { faceit?: boolean }) {
  const t = useT();
  return (
    <Card className="space-y-5 p-5 md:p-6" data-testid="getting-started">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
          {t("onboarding.start.title")}
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">{t("onboarding.start.lede")}</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li
              key={s.title}
              className="grid content-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
                  <Icon className="h-4 w-4 text-[var(--accent)]" aria-hidden />
                </span>
                <span className="font-mono text-sm text-[var(--text-tertiary)]">0{i + 1}</span>
              </div>
              <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{t(s.title)}</h3>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{t(s.body)}</p>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <StartActions faceit={faceit} upload="primary" />
      </div>
    </Card>
  );
}
