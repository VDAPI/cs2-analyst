"use client";

import { useEffect, useMemo, useState } from "react";
import { useReplayStore } from "@/stores/replay-store";
import { useT } from "@/lib/i18n/client";
import type { RoundSeries } from "@/lib/winprob/series";
import { cn } from "@/lib/utils/cn";

interface Payload {
  model: { id: string; kind: string; trained: boolean };
  series: RoundSeries | null;
}

const W = 1000;
const H = 48;

/**
 * Round win probability under the replay scrubber (S14): CT's chance as the
 * blue area, T's as the gold one, the jump at every kill and the plant, and
 * the value at the current frame. Aligned with the scrubber (same tick span).
 */
export function WinProbStrip({ matchId }: { matchId: string }) {
  const t = useT();
  const { frames, currentFrameIndex, currentRound } = useReplayStore();
  const [data, setData] = useState<{ round: number; payload: Payload | null } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/matches/${matchId}/winprob?round=${currentRound}`)
      .then((r) => (r.ok ? (r.json() as Promise<Payload>) : null))
      .then((payload) => alive && setData({ round: currentRound, payload }))
      .catch(() => alive && setData({ round: currentRound, payload: null }));
    return () => {
      alive = false;
    };
  }, [matchId, currentRound]);

  const firstTick = frames[0]?.tick ?? 0;
  const lastTick = frames[frames.length - 1]?.tick ?? 0;
  const span = Math.max(1, lastTick - firstTick);
  const currentTick = frames[currentFrameIndex]?.tick ?? firstTick;
  const series = data?.round === currentRound ? (data.payload?.series ?? null) : null;

  const path = useMemo(() => {
    if (!series || series.points.length === 0) return null;
    const x = (tick: number) => ((tick - firstTick) / span) * W;
    const y = (ct: number) => (1 - ct) * H;
    // Flat at the start value during freeze time, then the series, then flat at the result.
    const pts = [
      { tick: firstTick, ct: series.points[0].ct },
      ...series.points,
      { tick: lastTick, ct: series.points[series.points.length - 1].ct },
    ].filter((p) => p.tick >= firstTick && p.tick <= lastTick);
    const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.tick).toFixed(1)},${y(p.ct).toFixed(1)}`).join(" ");
    return { line, area: `${line} L${W},${H} L0,${H} Z` };
  }, [series, firstTick, lastTick, span]);

  const ctNow = useMemo(() => {
    if (!series) return null;
    let v = series.points[0]?.ct ?? null;
    for (const p of series.points) {
      if (p.tick > currentTick) break;
      v = p.ct;
    }
    return v;
  }, [series, currentTick]);

  // Hidden until this round's answer is in (no "no data" flash on every round change).
  if (!data || data.round !== currentRound || frames.length === 0) return null;
  if (!series || !path) {
    return <p className="text-xs text-[var(--text-tertiary)]">{t("winprob.stripNone")}</p>;
  }

  const ctPct = ctNow != null ? Math.round(ctNow * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="label-overline text-[var(--text-tertiary)]">
          {t("winprob.strip")}
          {!data.payload?.model.trained && <span className="normal-case"> · {t("winprob.approx")}</span>}
        </span>
        {ctPct != null && (
          <span className="font-mono tabular-nums">
            <span className="text-[var(--ct-blue)]">CT {ctPct}%</span>
            <span className="text-[var(--text-tertiary)]"> · </span>
            <span className="text-[var(--t-gold)]">T {100 - ctPct}%</span>
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-12 w-full overflow-hidden rounded-md"
        role="img"
        aria-label={ctPct != null ? `${t("winprob.strip")}: CT ${ctPct}%, T ${100 - ctPct}%` : t("winprob.strip")}
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--t-gold-muted)" />
        <path d={path.area} fill="var(--ct-blue-muted)" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--border)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
        <path d={path.line} fill="none" stroke="var(--ct-blue)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {series.events.map((e, i) => {
          const x = ((e.tick - firstTick) / span) * W;
          if (x < 0 || x > W) return null;
          return (
            <line
              key={`${e.tick}-${i}`}
              x1={x}
              x2={x}
              y1={(1 - e.before) * H}
              y2={(1 - e.after) * H}
              stroke={e.kind === "plant" ? "var(--t-gold)" : e.side === "CT" ? "var(--ct-blue)" : "var(--t-gold)"}
              strokeWidth={2.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        <line
          x1={((currentTick - firstTick) / span) * W}
          x2={((currentTick - firstTick) / span) * W}
          y1={0}
          y2={H}
          stroke="var(--text-primary)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className={cn("transition-none")}
        />
      </svg>
    </div>
  );
}
