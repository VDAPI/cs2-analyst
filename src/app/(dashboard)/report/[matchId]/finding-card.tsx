"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Play, Sparkles, Target } from "lucide-react";
import { FindingTag, buttonVariants } from "@/components/ui";
import { FindingClip } from "@/components/replay/finding-clip";
import type { RadarConfig } from "@/lib/canvas/radar";
import { fmtFindingValue, fmtRoundTime, replayHref, type FindingView } from "@/lib/findings/view";
import { useT } from "@/lib/i18n/client";
import { hasLineupPractice } from "@/lib/training/lineup-trainer";
import { cn } from "@/lib/utils/cn";
import { FindingImpact } from "@/components/winprob/finding-impact";
import { ProAdvicePanel } from "@/components/winprob/pro-advice";

export interface ClipContext {
  matchId: string;
  mapName: string;
  mapConfig: RadarConfig | null;
  /** Public link token: read-only view, clips load through the link (S16). */
  share?: string | null;
}

/** One mistake: when, what, the numbers, the advice, a 2D clip on demand and a jump into the replay. */
export function FindingCard({
  finding: f,
  ctx,
  clip,
  targetName,
  showAdvice = true,
}: {
  finding: FindingView;
  ctx: ClipContext;
  clip: { before: number; after: number };
  targetName: string | null;
  showAdvice?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pro, setPro] = useState(false);
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">R{f.roundNumber}</span>
        <span className="font-mono text-sm text-[var(--text-tertiary)]">{fmtRoundTime(f.roundTime)}</span>
        <FindingTag severity={f.severity} className="ml-auto" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        {f.detail}
        {targetName && <span className="text-[var(--text-tertiary)]"> · przeciwko {targetName}</span>}
      </p>
      {f.values.length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-tertiary)]">
          {f.values.map((v) => (
            <span key={v.label}>
              {v.label}: <span className="font-mono text-[var(--text-primary)]">{fmtFindingValue(v)}</span>
            </span>
          ))}
        </p>
      )}
      {f.wp && <FindingImpact wp={f.wp} />}
      {showAdvice && (
        <p className="rounded-lg bg-[var(--accent-muted)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]">
          <span className="font-semibold text-[var(--accent-hover)]">Rada: </span>
          {f.advice}
        </p>
      )}
      {open && (
        <FindingClip
          matchId={ctx.matchId}
          mapName={ctx.mapName}
          mapConfig={ctx.mapConfig}
          roundNumber={f.roundNumber}
          tick={f.tick}
          steamId={f.steamId}
          targetSteamId={f.targetSteamId}
          severity={f.severity}
          clip={clip}
          share={ctx.share}
          autoLoad
          label={`${f.label}, runda ${f.roundNumber}, ${fmtRoundTime(f.roundTime)}`}
        />
      )}
      {pro && <ProAdvicePanel matchId={ctx.matchId} findingId={f.id} mapName={ctx.mapName} mapConfig={ctx.mapConfig} />}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "flex-1 sm:flex-none")}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
          {open ? "Ukryj 2D" : "Podgląd 2D"}
        </button>
        {!ctx.share && (
          <button
            type="button"
            onClick={() => setPro((o) => !o)}
            aria-expanded={pro}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 sm:flex-none")}
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent-2)]" aria-hidden />
            {pro ? t("winprob.proHide") : t("winprob.proButton")}
          </button>
        )}
        {!ctx.share && (
          <Link
            href={replayHref(ctx.matchId, f)}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 sm:flex-none")}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            W replayu
          </Link>
        )}
        {!ctx.share && hasLineupPractice(f.type) && (
          <Link
            href={`/lineups?finding=${encodeURIComponent(f.id)}`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "flex-1 sm:flex-none")}
          >
            <Target className="h-3.5 w-3.5" aria-hidden />
            {t("lineups.practiceButton")}
          </Link>
        )}
      </div>
    </div>
  );
}
