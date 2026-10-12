/**
 * Badges (S16), computed from the player's analysed matches; nothing is
 * stored, so a badge's date is the match that first earned it. Pure, covered
 * by `npm run test:progress`. Labels live in the i18n dictionaries under
 * `badges.<key>`.
 */
import { matchResult, type MatchInput } from "./metrics";

export type BadgeKey =
  | "first_analysis"
  | "ten_analyses"
  | "still_shooter"
  | "fast_stop"
  | "headhunter"
  | "clutch_king"
  | "opener"
  | "mvp"
  | "clean_match"
  | "win_streak"
  | "improver"
  | "goal_reached";

export interface Badge {
  key: BadgeKey;
  earned: boolean;
  /** ISO date of the match (or goal) that earned it. */
  earnedAt: string | null;
  matchId: string | null;
  /** Towards the badge while locked, 0–1. */
  progress: number;
}

export const BADGE_KEYS: BadgeKey[] = [
  "first_analysis",
  "ten_analyses",
  "still_shooter",
  "fast_stop",
  "headhunter",
  "clutch_king",
  "opener",
  "mvp",
  "clean_match",
  "win_streak",
  "improver",
  "goal_reached",
];

/** Badge thresholds, also shown in the badge descriptions. */
export const BADGE_RULES = {
  stillShooterMaxPct: 5,
  stillShooterMinShots: 8,
  fastStopMaxMs: 100,
  fastStopMinSamples: 10,
  headhunterMinPct: 60,
  headhunterMinKills: 10,
  clutchWins: 2,
  openerFirstKills: 4,
  mvpRating: 1.4,
  cleanMinRounds: 13,
  winStreak: 3,
  improverWindow: 5,
  improverDrop: 0.3,
} as const;

/** First match (oldest → newest) satisfying `test`; progress = best fraction seen. */
function firstMatch(sorted: MatchInput[], test: (m: MatchInput) => boolean, frac: (m: MatchInput) => number) {
  let best = 0;
  for (const m of sorted) {
    if (test(m)) return { m, best: 1 };
    best = Math.max(best, Math.min(0.99, Math.max(0, frac(m))));
  }
  return { m: null, best };
}

const earnedBy = (key: BadgeKey, m: MatchInput | null, progress: number): Badge => ({
  key,
  earned: m != null,
  earnedAt: m?.date ?? null,
  matchId: m?.matchId ?? null,
  progress: m ? 1 : progress,
});

export function computeBadges(matches: MatchInput[], goalsAchieved: string[] = []): Badge[] {
  const R = BADGE_RULES;
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const out: Badge[] = [];

  out.push(earnedBy("first_analysis", sorted[0] ?? null, 0));
  out.push(earnedBy("ten_analyses", sorted[9] ?? null, sorted.length / 10));

  {
    const r = firstMatch(
      sorted,
      (m) => !!m.mech && m.mech.firstShots >= R.stillShooterMinShots && (m.mech.firstShotsMoving / m.mech.firstShots) * 100 <= R.stillShooterMaxPct,
      (m) => (m.mech && m.mech.firstShots >= R.stillShooterMinShots ? R.stillShooterMaxPct / Math.max(1, (m.mech.firstShotsMoving / m.mech.firstShots) * 100) : 0)
    );
    out.push(earnedBy("still_shooter", r.m, r.best));
  }
  {
    const r = firstMatch(
      sorted,
      (m) => !!m.mech && m.mech.counterStrafes >= R.fastStopMinSamples && m.mech.counterStrafeAvgMs != null && m.mech.counterStrafeAvgMs <= R.fastStopMaxMs,
      (m) => (m.mech?.counterStrafeAvgMs ? R.fastStopMaxMs / m.mech.counterStrafeAvgMs : 0)
    );
    out.push(earnedBy("fast_stop", r.m, r.best));
  }
  {
    const r = firstMatch(
      sorted,
      (m) => m.player.kills >= R.headhunterMinKills && m.player.hsPercent >= R.headhunterMinPct,
      (m) => (m.player.kills >= R.headhunterMinKills ? m.player.hsPercent / R.headhunterMinPct : 0)
    );
    out.push(earnedBy("headhunter", r.m, r.best));
  }
  {
    const r = firstMatch(sorted, (m) => m.player.clutchWins >= R.clutchWins, (m) => m.player.clutchWins / R.clutchWins);
    out.push(earnedBy("clutch_king", r.m, r.best));
  }
  {
    const r = firstMatch(sorted, (m) => m.player.firstKills >= R.openerFirstKills, (m) => m.player.firstKills / R.openerFirstKills);
    out.push(earnedBy("opener", r.m, r.best));
  }
  {
    const r = firstMatch(sorted, (m) => m.player.hltvRating >= R.mvpRating, (m) => m.player.hltvRating / R.mvpRating);
    out.push(earnedBy("mvp", r.m, r.best));
  }
  {
    const r = firstMatch(
      sorted,
      (m) => !!m.findings && m.rounds >= R.cleanMinRounds && m.findings.high === 0,
      (m) => (m.findings && m.rounds >= R.cleanMinRounds ? 1 / (1 + m.findings.high) : 0)
    );
    out.push(earnedBy("clean_match", r.m, r.best));
  }
  {
    let streak = 0;
    let best = 0;
    let at: MatchInput | null = null;
    for (const m of sorted) {
      streak = matchResult(m).result === "W" ? streak + 1 : 0;
      best = Math.max(best, streak);
      if (streak >= R.winStreak) {
        at = m;
        break;
      }
    }
    out.push(earnedBy("win_streak", at, best / R.winStreak));
  }
  {
    // Serious mistakes per 10 rounds: a window of N matches vs the N before it.
    const N = R.improverWindow;
    const rate = (list: MatchInput[]) => {
      const rounds = list.reduce((s, m) => s + m.rounds, 0);
      return rounds > 0 ? (list.reduce((s, m) => s + m.findings!.high, 0) / rounds) * 10 : null;
    };
    const withFindings = sorted.filter((m) => m.findings && m.rounds > 0);
    let at: MatchInput | null = null;
    let best = 0;
    for (let i = 2 * N; i <= withFindings.length; i++) {
      const before = rate(withFindings.slice(i - 2 * N, i - N));
      const after = rate(withFindings.slice(i - N, i));
      if (before == null || after == null || before === 0) continue;
      const drop = (before - after) / before;
      if (drop >= R.improverDrop) {
        at = withFindings[i - 1];
        break;
      }
      best = Math.max(best, Math.min(0.99, drop / R.improverDrop));
    }
    if (!at && withFindings.length < 2 * N) best = Math.max(best, (withFindings.length / (2 * N)) * 0.5);
    out.push(earnedBy("improver", at, best));
  }
  {
    const first = [...goalsAchieved].sort()[0] ?? null;
    out.push({ key: "goal_reached", earned: first != null, earnedAt: first, matchId: null, progress: first ? 1 : 0 });
  }
  return out;
}
