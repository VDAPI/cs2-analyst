"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useToast } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils/cn";

/** "Helpful / not helpful" on one piece of advice; a second click clears the rating (S15). */
export function FeedbackButtons({
  type,
  context,
  initial,
}: {
  type: string;
  /** "match:<matchId>" or "plan:<weekStart>". */
  context: string;
  initial: boolean | null;
}) {
  const t = useT();
  const toast = useToast();
  const [value, setValue] = useState<boolean | null>(initial);
  const [busy, setBusy] = useState(false);

  async function rate(helpful: boolean) {
    const next = value === helpful ? null : helpful;
    const prev = value;
    setValue(next);
    setBusy(true);
    try {
      const res = await fetch("/api/coach/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, context, helpful: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (next !== null) toast({ title: t("coach.feedbackThanks"), description: t("coach.feedbackHint"), variant: "success" });
    } catch {
      setValue(prev);
      toast({ title: t("common.error"), variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const btn = (helpful: boolean) => {
    const active = value === helpful;
    const Icon = helpful ? ThumbsUp : ThumbsDown;
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => rate(helpful)}
        aria-pressed={active}
        aria-label={helpful ? t("coach.helpful") : t("coach.notHelpful")}
        title={helpful ? t("coach.helpful") : t("coach.notHelpful")}
        className={cn(
          "inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs transition-colors max-md:min-h-11 max-md:min-w-11",
          active
            ? helpful
              ? "border-[var(--good)] bg-[var(--good-muted)] text-[var(--good)]"
              : "border-[var(--mistake)] bg-[var(--mistake-muted)] text-[var(--mistake)]"
            : "border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={t("coach.feedbackHint")}>
      {btn(true)}
      {btn(false)}
    </div>
  );
}
