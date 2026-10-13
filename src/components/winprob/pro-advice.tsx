"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui";
import { LazyFindingClip } from "@/components/replay/finding-clip-lazy";
import type { RadarConfig } from "@/lib/canvas/radar";
import { useLocale, useT } from "@/lib/i18n/client";
import { fmtPp } from "@/lib/winprob/format";
import type { MessageKey } from "@/lib/i18n/translate";
import type { ProAdvice } from "@/lib/winprob/persist";
import { ACTION_HORIZON_S, type ProAction } from "@/lib/winprob/situations";
import { cn } from "@/lib/utils/cn";

/** Fewer neighbours than this is not a comparison. */
const MIN_NEIGHBOURS = 5;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type State = { status: "loading" } | { status: "error" } | { status: "done"; advice: ProAdvice | null };

/**
 * "Co zrobiłby pro" for one finding (S14): what pros did in the same
 * situation on this map, how it went for their team, and clips of the
 * closest pro moments.
 */
export function ProAdvicePanel({
  matchId,
  findingId,
  mapName,
  mapConfig,
}: {
  matchId: string;
  findingId: string;
  mapName: string;
  mapConfig: RadarConfig | null;
}) {
  const t = useT();
  const locale = useLocale();
  const [state, setState] = useState<State>({ status: "loading" });
  const [clipOf, setClipOf] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/matches/${matchId}/findings/${findingId}/pro`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { advice: ProAdvice | null }) => alive && setState({ status: "done", advice: body.advice }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [matchId, findingId]);

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {t("winprob.proLoading")}
      </p>
    );
  }
  if (state.status === "error") return <p className="text-xs text-[var(--mistake)]">{t("winprob.proError")}</p>;
  const a = state.advice;
  if (!a) return <p className="text-xs text-[var(--text-tertiary)]">{t("winprob.proUnavailable")}</p>;

  const s = a.situation;
  const actionLabel = (x: ProAction) => t(`winprob.action.${x}` as MessageKey);
  const pluralLabel = (x: ProAction) => t(`winprob.actionPlural.${x}` as MessageKey);

  return (
    <div className="space-y-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-2.5">
      <p className="text-xs text-[var(--text-secondary)]">
        <span className={cn("font-semibold", s.side === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>
          {s.side}
        </span>{" "}
        ·{" "}
        {t("winprob.situation", {
          us: s.aliveUs,
          them: s.aliveThem,
          bomb: s.planted ? t("winprob.bombPlanted") : t("winprob.bombNotPlanted"),
          clock: clock(s.timeLeft),
        })}
      </p>

      {a.proMatches === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">{t("winprob.proNoData")}</p>
      ) : a.result.n < MIN_NEIGHBOURS ? (
        <p className="text-xs text-[var(--text-tertiary)]">{t("winprob.proNoMatch", { matches: a.proMatches })}</p>
      ) : (
        <>
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {t(a.result.exact ? "winprob.heading" : "winprob.headingWide", { n: a.result.n, matches: a.proMatches })}
          </p>
          <ul className="space-y-1.5" aria-label={t("winprob.proButton")}>
            {a.result.actions.map((x) => {
              const mine = a.you?.action === x.action;
              return (
                <li key={x.action} className="space-y-0.5">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className={cn("min-w-0 flex-1 truncate", mine ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                      {pluralLabel(x.action)}
                      {mine && <span className="text-[var(--accent-hover)]"> · {t("winprob.you")}</span>}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--text-primary)]">{Math.round(x.share * 100)}%</span>
                    <span
                      className={cn(
                        "w-16 text-right font-mono tabular-nums",
                        x.avgDeltaPp >= 0 ? "text-[var(--good)]" : "text-[var(--mistake)]"
                      )}
                      title={t("winprob.effectHint", { s: ACTION_HORIZON_S })}
                    >
                      {t("winprob.effect", { pp: fmtPp(x.avgDeltaPp, locale) })}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
                    <div
                      className={cn("h-full rounded-full", mine ? "bg-[var(--accent-2)]" : "bg-[var(--accent)]")}
                      style={{ width: `${Math.max(3, Math.round(x.share * 100))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {a.you && (
            <p className="text-xs text-[var(--text-secondary)]">
              {t("winprob.youDid", { action: actionLabel(a.you.action) })}
              {a.youDeltaPp != null && (
                <span className={cn("font-mono", a.youDeltaPp >= 0 ? "text-[var(--good)]" : "text-[var(--mistake)]")}>
                  {" "}
                  ({t("winprob.effect", { pp: fmtPp(a.youDeltaPp, locale) })})
                </span>
              )}
            </p>
          )}
          {a.examples.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {a.examples.slice(0, 3).map((ex, i) => (
                  <button
                    key={`${ex.matchId}-${ex.tick}-${ex.steamId}`}
                    type="button"
                    onClick={() => setClipOf(clipOf === i ? null : i)}
                    aria-expanded={clipOf === i}
                    className={cn(buttonVariants({ variant: clipOf === i ? "primary" : "ghost", size: "sm" }), "max-w-full")}
                    title={ex.label}
                  >
                    <Play className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">
                      {t("winprob.exampleLabel", { name: ex.name || "pro", round: ex.roundNumber })} · {actionLabel(ex.action)}
                    </span>
                  </button>
                ))}
              </div>
              {clipOf != null && a.examples[clipOf] && (
                <div className="space-y-1">
                  <LazyFindingClip
                    key={clipOf}
                    matchId={a.examples[clipOf].matchId}
                    mapName={mapName}
                    mapConfig={mapConfig}
                    roundNumber={a.examples[clipOf].roundNumber}
                    tick={a.examples[clipOf].tick}
                    steamId={a.examples[clipOf].steamId}
                    targetSteamId={null}
                    severity="low"
                    clip={{ before: 1, after: ACTION_HORIZON_S }}
                    marker={false}
                    autoLoad
                    label={`${t("winprob.example")}: ${a.examples[clipOf].label}`}
                  />
                  <p className="flex items-center gap-1 truncate text-xs text-[var(--text-tertiary)]">
                    <Users className="h-3 w-3 shrink-0" aria-hidden />
                    {a.examples[clipOf].label}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
