/**
 * Friends ranking (S25): the player and their friends ordered by one progress
 * metric over each one's latest matches. Report metrics are judged on summed
 * counts (aggregateWindow), like the progress page, so a 3-match player and a
 * 10-match player are compared on the same rule. Pure, covered by
 * `npm run test:social`.
 */
import { aggregateWindow, progressMetric, type MatchInput, type ProgressMetricKey } from "@/lib/progress/metrics";

/** Latest matches of each player that count. */
export const RANKING_WINDOW = 10;
/** Fewer analysed matches than this → listed, but without a place. */
export const MIN_RANKING_MATCHES = 3;
/** Most friends per player (keeps the ranking query bounded). */
export const MAX_FRIENDS = 50;

/** Metrics offered in the ranking picker; the first is the default. */
export const RANKING_METRICS: ProgressMetricKey[] = [
  "rating",
  "adr",
  "kd",
  "kill_hs",
  "serious",
  "moving_first",
  "first_bullet",
  "crosshair",
  "reaction",
  "flash_blind",
  "traded_deaths",
  "opening",
];

export function isRankingMetric(v: unknown): v is ProgressMetricKey {
  return typeof v === "string" && (RANKING_METRICS as string[]).includes(v);
}

export interface RankingPlayer {
  userId: string;
  name: string;
  isMe: boolean;
  /** Oldest → newest or newest → oldest; only the latest RANKING_WINDOW by date are used. */
  matches: MatchInput[];
}

export interface RankingRow {
  userId: string;
  name: string;
  isMe: boolean;
  /** 1-based; ties share a place ("1, 1, 3"); null = too few matches or no value. */
  rank: number | null;
  value: number | null;
  /** Matches in the window. */
  matches: number;
}

export function rankPlayers(players: RankingPlayer[], metric: ProgressMetricKey): RankingRow[] {
  const def = progressMetric(metric);
  const higher = (def?.direction ?? "higher") === "higher";
  const rows = players.map((p) => {
    const latest = [...p.matches].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RANKING_WINDOW);
    const value = latest.length > 0 ? aggregateWindow(latest)[metric]?.value ?? null : null;
    return { userId: p.userId, name: p.name, isMe: p.isMe, value, matches: latest.length };
  });
  const ranked = rows
    .filter((r) => r.value != null && r.matches >= MIN_RANKING_MATCHES)
    .sort((a, b) => (higher ? b.value! - a.value! : a.value! - b.value!) || a.name.localeCompare(b.name));
  const unranked = rows
    .filter((r) => !(r.value != null && r.matches >= MIN_RANKING_MATCHES))
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));

  const out: RankingRow[] = [];
  ranked.forEach((r, i) => {
    const prev = out[i - 1];
    const rank = prev && prev.value === r.value ? prev.rank : i + 1;
    out.push({ ...r, rank });
  });
  for (const r of unranked) out.push({ ...r, rank: null });
  return out;
}
