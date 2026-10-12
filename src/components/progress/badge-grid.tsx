"use client";

import {
  Award,
  Crosshair,
  Flame,
  Footprints,
  Goal,
  Medal,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { BADGE_RULES, type Badge, type BadgeKey } from "@/lib/progress/badges";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TranslateVars } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

const ICON: Record<BadgeKey, LucideIcon> = {
  first_analysis: Sparkles,
  ten_analyses: Medal,
  still_shooter: Footprints,
  fast_stop: Target,
  headhunter: Crosshair,
  clutch_king: ShieldCheck,
  opener: Swords,
  mvp: Star,
  clean_match: Award,
  win_streak: Flame,
  improver: TrendingUp,
  goal_reached: Goal,
};

const R = BADGE_RULES;
/** Numbers in each badge description, from the same rules the badges are checked with. */
const VARS: Partial<Record<BadgeKey, TranslateVars>> = {
  still_shooter: { pct: R.stillShooterMaxPct, n: R.stillShooterMinShots },
  fast_stop: { ms: R.fastStopMaxMs, n: R.fastStopMinSamples },
  headhunter: { pct: R.headhunterMinPct, n: R.headhunterMinKills },
  clutch_king: { n: R.clutchWins },
  opener: { n: R.openerFirstKills },
  mvp: { rating: R.mvpRating.toFixed(2) },
  win_streak: { n: R.winStreak },
  improver: { pct: Math.round(R.improverDrop * 100), n: R.improverWindow },
};

/** Earned badges first (lime), then the locked ones with how close the player is. */
export function BadgeGrid({ badges, className }: { badges: Badge[]; className?: string }) {
  const t = useT();
  const ordered = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned) || b.progress - a.progress);
  return (
    <ul className={cn("grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {ordered.map((b) => {
        const Icon = ICON[b.key];
        return (
          <li
            key={b.key}
            className={cn(
              "flex min-w-0 items-start gap-3 rounded-xl border p-3",
              b.earned
                ? "border-[rgba(198,255,61,0.35)] bg-[var(--accent-2-muted)]"
                : "border-[var(--border)] bg-[var(--surface-1)]"
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                b.earned ? "bg-[var(--accent-2)] text-[var(--on-accent)]" : "bg-[var(--surface-3)] text-[var(--text-tertiary)]"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", b.earned ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                {t(`badges.${b.key}.title` as MessageKey)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">{t(`badges.${b.key}.desc` as MessageKey, VARS[b.key])}</p>
              {b.earned ? (
                <p className="mt-1 text-xs font-medium text-[var(--accent-2)]">
                  {b.earnedAt ? t("progress.badgeEarnedOn", { date: formatDate(b.earnedAt) }) : null}
                </p>
              ) : (
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
                    <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round(b.progress * 100)}%` }} />
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">{Math.round(b.progress * 100)}%</span>
                  <span className="sr-only">{t("progress.badgeLocked")}</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
