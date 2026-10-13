/**
 * Weekly challenges (S25): three goals a week, the same for every player
 * ("first shots while moving at most 15% in 3 matches"), so friends race on
 * the same thing. Picked deterministically from the week (Monday in
 * Europe/Warsaw, weekStartOf from the coach plan), judged on the progress
 * metrics of the week's matches — nothing is stored. Pure, covered by
 * `npm run test:social`.
 */
import { weekStartOf } from "@/lib/coach/plan";
import { meets, progressMetric, type MatchPoint, type ProgressMetricKey } from "@/lib/progress/metrics";

export type ChallengeGroup = "aim" | "core" | "utility" | "team";

export interface ChallengeDef {
  id: string;
  group: ChallengeGroup;
  metric: ProgressMetricKey;
  target: number;
  /** Matches of the week that must meet the target. */
  matches: number;
}

/** Thresholds are the progress goals' defaults (PROGRESS_METRICS `goal`), reachable in a good match. */
export const CHALLENGE_POOL: ChallengeDef[] = [
  { id: "still-15", group: "aim", metric: "moving_first", target: 15, matches: 3 },
  { id: "first-bullet-30", group: "aim", metric: "first_bullet", target: 30, matches: 3 },
  { id: "crosshair-8", group: "aim", metric: "crosshair", target: 8, matches: 3 },
  { id: "kill-hs-50", group: "aim", metric: "kill_hs", target: 50, matches: 2 },
  { id: "reaction-350", group: "aim", metric: "reaction", target: 350, matches: 3 },
  { id: "rating-110", group: "core", metric: "rating", target: 1.1, matches: 3 },
  { id: "adr-80", group: "core", metric: "adr", target: 80, matches: 3 },
  { id: "kd-110", group: "core", metric: "kd", target: 1.1, matches: 3 },
  { id: "serious-1", group: "core", metric: "serious", target: 1, matches: 2 },
  { id: "flash-12", group: "utility", metric: "flash_blind", target: 1.2, matches: 2 },
  { id: "unused-150", group: "utility", metric: "unused_utility", target: 150, matches: 3 },
  { id: "smoke-15", group: "utility", metric: "smoke_wasted", target: 15, matches: 2 },
  { id: "team-flash-03", group: "utility", metric: "team_flash", target: 0.3, matches: 3 },
  { id: "traded-30", group: "team", metric: "traded_deaths", target: 30, matches: 3 },
  { id: "trades-50", group: "team", metric: "trades", target: 50, matches: 2 },
  { id: "opening-50", group: "team", metric: "opening", target: 50, matches: 3 },
];

export const CHALLENGES_PER_WEEK = 3;

/** FNV-1a: a stable 32-bit seed from the week key. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small seeded PRNG, the same sequence in Node and the browser. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The week a date belongs to: its Monday, "YYYY-MM-DD" (Europe/Warsaw). */
export function challengeWeek(date: Date): string {
  return weekStartOf(date);
}

/** This week's challenges: one per group, three different groups, same for everyone. */
export function challengesForWeek(week: string): ChallengeDef[] {
  const next = rng(hash(`cs2a-challenges-${week}`));
  const shuffled = CHALLENGE_POOL.map((c) => ({ c, k: next() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
  const out: ChallengeDef[] = [];
  const groups = new Set<ChallengeGroup>();
  for (const c of shuffled) {
    if (groups.has(c.group)) continue;
    groups.add(c.group);
    out.push(c);
    if (out.length === CHALLENGES_PER_WEEK) break;
  }
  return out;
}

export interface ChallengeProgress {
  id: string;
  metric: ProgressMetricKey;
  target: number;
  needed: number;
  /** Matches of the week that met the target (capped at `needed`). */
  done: number;
  completed: boolean;
  /** Best value of the week, null without a value. */
  best: number | null;
}

/** Progress on one challenge from the player's matches; only matches of `week` count. */
export function evaluateChallenge(def: ChallengeDef, points: MatchPoint[], week: string): ChallengeProgress {
  const metric = progressMetric(def.metric);
  const direction = metric?.direction ?? "higher";
  const values = points
    .filter((p) => challengeWeek(new Date(p.date)) === week)
    .map((p) => p.values[def.metric]?.value ?? null)
    .filter((v): v is number => v != null);
  const hits = values.filter((v) => meets(direction, v, def.target)).length;
  const best = values.length === 0 ? null : direction === "higher" ? Math.max(...values) : Math.min(...values);
  return {
    id: def.id,
    metric: def.metric,
    target: def.target,
    needed: def.matches,
    done: Math.min(hits, def.matches),
    completed: hits >= def.matches,
    best,
  };
}
