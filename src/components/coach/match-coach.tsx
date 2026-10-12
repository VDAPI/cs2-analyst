"use client";

import Link from "next/link";
import { ArrowRight, GraduationCap, Lightbulb } from "lucide-react";
import { Card, buttonVariants } from "@/components/ui";
import type { CoachMatchText, CoachStatus } from "@/lib/coach/text";
import { useT } from "@/lib/i18n/client";
import { CoachSource } from "./coach-source";
import { FeedbackButtons } from "./feedback-buttons";
import { useCoachText } from "./use-coach-text";

/** The AI coach's notes on one player of a match, on the report (S15). */
export function MatchCoach({
  matchId,
  steamId,
  initial,
  ratings,
  aiEnabled,
}: {
  matchId: string;
  steamId: string;
  initial: { text: CoachMatchText; status: CoachStatus };
  ratings: Record<string, boolean>;
  aiEnabled: boolean;
}) {
  const t = useT();
  const { text, status, writing, rewrite } = useCoachText("/api/coach/match", { matchId, steamId }, initial, aiEnabled);
  const context = `match:${matchId}`;

  return (
    <Card className="space-y-4 border-[var(--border-active)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent-hover)]">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">{t("coach.matchTitle")}</h2>
            <p className="text-sm text-[var(--text-tertiary)]">{t("coach.matchHint")}</p>
          </div>
        </div>
        <CoachSource status={status} writing={writing} aiEnabled={aiEnabled} onRewrite={rewrite} />
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-primary)]">{text.summary}</p>

      {text.items.length > 0 && (
        <ol className="space-y-3">
          {text.items.map((item, i) => (
            <li key={item.type} className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-muted)] font-mono text-xs font-bold text-[var(--accent-hover)]">
                  {i + 1}
                </span>
                <h3 className="min-w-0 flex-1 font-display text-base font-semibold text-[var(--text-primary)]">{item.headline}</h3>
                <FeedbackButtons type={item.type} context={context} initial={ratings[item.type] ?? null} />
              </div>
              {/* The standard "why" is already on the issue card below; only the AI's own explanation adds to it. */}
              {status === "ai" && <p className="text-sm text-[var(--text-secondary)]">{item.explanation}</p>}
              <p className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
                <span>{item.action}</span>
              </p>
            </li>
          ))}
        </ol>
      )}

      <Link href="/coach" className={buttonVariants({ variant: "secondary", size: "sm" })}>
        {t("coach.matchPlan")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </Card>
  );
}
