/**
 * Progress over time (S16): one value per match for every tracked metric, the
 * window average judged with the same thresholds as the match report, and the
 * trend between the latest matches and the ones before them. Pure (no DB),
 * covered by `npm run test:progress`.
 *
 * Two kinds of metric:
 * - "report" metrics are the report's own numbers (`playerMetrics()` in
 *   src/lib/findings/report.ts). A window is judged by summing the raw counts
 *   of its matches and running `playerMetrics()` on the sum, so the thresholds
 *   live in one place and a window of small samples is judged as one sample.
 * - "core" metrics come from the scoreboard (rating, ADR, K/D, HS% of kills)
 *   and the findings (serious mistakes per 10 rounds), with thresholds here.
 */
import type { MetricStatus } from "@/lib/analysis/aim";
import { playerMetrics, type AimSummary, type MechanicsSummary } from "@/lib/findings/report";
export { formatProgressValue } from "./format";

export type Direction = "lower" | "higher";

export type ProgressMetricKey =
  | "rating"
  | "adr"
  | "kd"
  | "kill_hs"
  | "serious"
  | "moving_first"
  | "strafe"
  | "first_bullet"
  | "hs"
  | "crosshair"
  | "reaction"
  | "ttd"
  | "spray"
  | "preaim"
  | "overflick"
  | "dry_peek"
  | "noise"
  | "jump"
  | "reload";

export interface ProgressMetricDef {
  key: ProgressMetricKey;
  source: "core" | "report";
  direction: Direction;
  unit: "" | "%" | "ms" | "°";
  decimals: number;
  /** Core metrics only: judged good at/past `good`, warn at/past `warn`. */
  good?: number;
  warn?: number;
  /** Default target offered when the player sets a goal. */
  goal?: number;
  /** Shown first on the progress page and the public profile. */
  headline?: boolean;
}

export const PROGRESS_METRICS: ProgressMetricDef[] = [
  { key: "rating", source: "core", direction: "higher", unit: "", decimals: 2, good: 1.1, warn: 0.9, goal: 1.1, headline: true },
  { key: "adr", source: "core", direction: "higher", unit: "", decimals: 0, good: 80, warn: 65, goal: 80, headline: true },
  { key: "kd", source: "core", direction: "higher", unit: "", decimals: 2, good: 1.1, warn: 0.9, goal: 1.1 },
  { key: "kill_hs", source: "core", direction: "higher", unit: "%", decimals: 0, good: 50, warn: 35 },
  { key: "serious", source: "core", direction: "lower", unit: "", decimals: 1, good: 1, warn: 2.5, goal: 1, headline: true },
  { key: "moving_first", source: "report", direction: "lower", unit: "%", decimals: 0, goal: 15, headline: true },
  { key: "strafe", source: "report", direction: "lower", unit: "ms", decimals: 0, goal: 120 },
  { key: "first_bullet", source: "report", direction: "higher", unit: "%", decimals: 0, goal: 30, headline: true },
  { key: "hs", source: "report", direction: "higher", unit: "%", decimals: 0, goal: 40 },
  { key: "crosshair", source: "report", direction: "lower", unit: "°", decimals: 1, goal: 8, headline: true },
  { key: "reaction", source: "report", direction: "lower", unit: "ms", decimals: 0, goal: 350 },
  { key: "ttd", source: "report", direction: "lower", unit: "ms", decimals: 0, goal: 600 },
  { key: "spray", source: "report", direction: "higher", unit: "%", decimals: 0, goal: 25 },
  { key: "preaim", source: "report", direction: "higher", unit: "%", decimals: 0 },
  { key: "overflick", source: "report", direction: "lower", unit: "%", decimals: 0 },
  { key: "dry_peek", source: "report", direction: "lower", unit: "%", decimals: 0, goal: 50 },
  { key: "noise", source: "report", direction: "lower", unit: "", decimals: 1, goal: 2 },
  { key: "jump", source: "report", direction: "lower", unit: "", decimals: 1 },
  { key: "reload", source: "report", direction: "lower", unit: "", decimals: 1 },
];

export const PROGRESS_METRIC_KEYS = PROGRESS_METRICS.map((m) => m.key);

export function progressMetric(key: string): ProgressMetricDef | undefined {
  return PROGRESS_METRICS.find((m) => m.key === key);
}

/** Default window of the progress page ("the last 10 matches"). */
export const PROGRESS_WINDOW = 10;
/** Latest matches compared against the rest of the window for the trend arrow. */
export const TREND_RECENT = 3;
/** Fewer values than this in the window → no trend. */
export const MIN_TREND_POINTS = 4;

/** One analysed match of the player, as the progress screens need it. */
export interface MatchInput {
  matchId: string;
  date: string; // ISO
  map: string;
  scoreCT: number;
  scoreT: number;
  rounds: number;
  player: {
    name: string;
    team: "CT" | "T";
    kills: number;
    deaths: number;
    adr: number;
    hltvRating: number;
    hsPercent: number;
    firstKills: number;
    clutchWins: number;
  };
  mech: MechanicsSummary | null;
  aim: AimSummary | null;
  /** Counts by severity; null while the match's findings were never built. */
  findings: { high: number; medium: number; low: number } | null;
}

export interface MetricValue {
  value: number | null;
  status: MetricStatus;
  samples: number;
}

export interface MatchPoint {
  matchId: string;
  date: string;
  map: string;
  /** Final score from the player's side (their team's rounds first). */
  own: number;
  opp: number;
  result: "W" | "L" | "D";
  values: Record<ProgressMetricKey, MetricValue>;
}

const round = (v: number, decimals: number) => {
  const k = 10 ** decimals;
  return Math.round(v * k) / k;
};

export function coreStatus(def: ProgressMetricDef, v: number | null): MetricStatus {
  if (v == null || def.good == null || def.warn == null) return "none";
  if (def.direction === "higher") return v >= def.good ? "good" : v >= def.warn ? "warn" : "bad";
  return v <= def.good ? "good" : v <= def.warn ? "warn" : "bad";
}

/**
 * The player finished the match on `team`, and the final score is absolute
 * per side (CT/T at the end), so their rounds are that side's score.
 */
export function matchResult(m: Pick<MatchInput, "scoreCT" | "scoreT" | "player">) {
  const own = m.player.team === "CT" ? m.scoreCT : m.scoreT;
  const opp = m.player.team === "CT" ? m.scoreT : m.scoreCT;
  return { own, opp, result: (own > opp ? "W" : own < opp ? "L" : "D") as MatchPoint["result"] };
}

function coreValues(m: Pick<MatchInput, "player" | "rounds" | "findings">): Record<string, number | null> {
  const p = m.player;
  return {
    rating: p.hltvRating > 0 ? p.hltvRating : null,
    adr: p.adr,
    kd: p.deaths > 0 ? p.kills / p.deaths : p.kills > 0 ? p.kills : null,
    kill_hs: p.kills > 0 ? p.hsPercent : null,
    serious: m.findings && m.rounds > 0 ? (m.findings.high / m.rounds) * 10 : null,
  };
}

function reportValues(mech: MechanicsSummary | null, aim: AimSummary | null): Map<string, MetricValue> {
  return new Map(playerMetrics(mech, aim).map((r) => [r.key, { value: r.value, status: r.status, samples: r.samples }]));
}

/** Every metric of one match. */
export function matchValues(m: MatchInput): Record<ProgressMetricKey, MetricValue> {
  const core = coreValues(m);
  const report = reportValues(m.mech, m.aim);
  const out = {} as Record<ProgressMetricKey, MetricValue>;
  for (const def of PROGRESS_METRICS) {
    if (def.source === "core") {
      const raw = core[def.key];
      const value = raw == null ? null : round(raw, def.decimals);
      out[def.key] = { value, status: coreStatus(def, value), samples: value == null ? 0 : 1 };
    } else {
      const r = report.get(def.key);
      out[def.key] = r
        ? { ...r, value: r.value == null ? null : round(r.value, def.decimals) }
        : { value: null, status: "none", samples: 0 };
    }
  }
  return out;
}

/** Points oldest → newest. */
export function buildHistory(matches: MatchInput[]): MatchPoint[] {
  return [...matches]
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchId.localeCompare(b.matchId))
    .map((m) => ({ matchId: m.matchId, date: m.date, map: m.map, ...matchResult(m), values: matchValues(m) }));
}

// ─── Window aggregate ─────────────────────────────────────

const AIM_PER_MATCH = ["noiseEpisodes", "noiseCostly", "jumps", "jumpsNearEnemy", "airShots", "badReloads", "reloads"] as const;
const AIM_MEDIANS = [
  ["crosshairMedianDeg", "crosshairSamples"],
  ["crosshairAvgDeg", "crosshairSamples"],
  ["reactionMedianMs", "reactionSamples"],
  ["ttdMedianMs", "ttdSamples"],
] as const;

/** Sum of the matches' counts; medians become a sample-weighted mean. */
export function aggregateMechanics(list: MechanicsSummary[]): MechanicsSummary | null {
  if (list.length === 0) return null;
  const sum = (k: keyof MechanicsSummary) => list.reduce((s, m) => s + ((m[k] as number | null) ?? 0), 0);
  const strafes = sum("counterStrafes");
  const strafeMs = list.reduce((s, m) => s + (m.counterStrafeAvgMs ?? 0) * m.counterStrafes, 0);
  return {
    firstShots: sum("firstShots"),
    firstShotsMoving: sum("firstShotsMoving"),
    firstShotHits: sum("firstShotHits"),
    hits: sum("hits"),
    headHits: sum("headHits"),
    counterStrafes: strafes,
    counterStrafeAvgMs: strafes > 0 ? strafeMs / strafes : null,
  };
}

/**
 * Ratios sum their parts; per-match counts (noise, jumps, bad reloads) are
 * averaged so the window is judged like one typical match.
 */
export function aggregateAim(list: AimSummary[]): AimSummary | null {
  if (list.length === 0) return null;
  const out = { ...list[0] } as AimSummary;
  const numeric = Object.keys(list[0]).filter(
    (k) => typeof (list[0] as unknown as Record<string, unknown>)[k] === "number" || (list[0] as unknown as Record<string, unknown>)[k] === null
  );
  const rec = out as unknown as Record<string, number | null | boolean>;
  for (const k of numeric) {
    rec[k] = list.reduce((s, a) => s + (((a as unknown as Record<string, number | null>)[k]) ?? 0), 0);
  }
  for (const [med, n] of AIM_MEDIANS) {
    const total = list.reduce((s, a) => s + (a[med] != null ? a[n] : 0), 0);
    rec[med] = total > 0 ? list.reduce((s, a) => s + (a[med] ?? 0) * (a[med] != null ? a[n] : 0), 0) / total : null;
  }
  const withReloads = list.filter((a) => a.reloadData);
  for (const k of AIM_PER_MATCH) {
    const src = k === "badReloads" || k === "reloads" ? withReloads : list;
    rec[k] = src.length > 0 ? round(src.reduce((s, a) => s + a[k], 0) / src.length, 1) : 0;
  }
  out.reloadData = withReloads.length > 0;
  return out;
}

/** The window judged as a whole: report metrics on summed counts, core metrics averaged. */
export function aggregateWindow(matches: MatchInput[]): Record<ProgressMetricKey, MetricValue> {
  const report = reportValues(
    aggregateMechanics(matches.flatMap((m) => (m.mech ? [m.mech] : []))),
    aggregateAim(matches.flatMap((m) => (m.aim ? [m.aim] : [])))
  );
  const withFindings = matches.filter((m) => m.findings && m.rounds > 0);
  const highs = withFindings.reduce((s, m) => s + m.findings!.high, 0);
  const rounds = withFindings.reduce((s, m) => s + m.rounds, 0);
  const out = {} as Record<ProgressMetricKey, MetricValue>;
  for (const def of PROGRESS_METRICS) {
    if (def.source === "report") {
      const r = report.get(def.key);
      out[def.key] = r ? { ...r, value: r.value == null ? null : round(r.value, def.decimals) } : { value: null, status: "none", samples: 0 };
      continue;
    }
    let value: number | null;
    let samples: number;
    if (def.key === "serious") {
      value = rounds > 0 ? round((highs / rounds) * 10, def.decimals) : null;
      samples = withFindings.length;
    } else {
      const vals = matches.map((m) => coreValues(m)[def.key]).filter((v): v is number => v != null);
      value = vals.length > 0 ? round(vals.reduce((s, v) => s + v, 0) / vals.length, def.decimals) : null;
      samples = vals.length;
    }
    out[def.key] = { value, status: coreStatus(def, value), samples };
  }
  return out;
}

// ─── Trend ─────────────────────────────────────────────────

export interface Trend {
  recent: number;
  previous: number;
  delta: number;
  verdict: "better" | "worse" | "flat";
}

/**
 * Mean of the latest TREND_RECENT values against the mean of the earlier
 * ones. A change smaller than 5% of the earlier mean (or of one unit of the
 * last shown decimal) counts as flat.
 */
export function computeTrend(def: Pick<ProgressMetricDef, "direction" | "decimals">, values: Array<number | null>): Trend | null {
  const vals = values.filter((v): v is number => v != null);
  if (vals.length < MIN_TREND_POINTS) return null;
  const k = Math.min(TREND_RECENT, Math.floor(vals.length / 2));
  const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const recent = mean(vals.slice(-k));
  const previous = mean(vals.slice(0, -k));
  const delta = recent - previous;
  const tolerance = Math.max(Math.abs(previous) * 0.05, 10 ** -def.decimals);
  const better = def.direction === "higher" ? delta > 0 : delta < 0;
  return {
    recent: round(recent, def.decimals),
    previous: round(previous, def.decimals),
    delta: round(delta, def.decimals),
    verdict: Math.abs(delta) < tolerance ? "flat" : better ? "better" : "worse",
  };
}

/** Does `value` meet `target` for a metric of this direction? */
export function meets(direction: Direction, value: number | null, target: number): boolean {
  if (value == null) return false;
  return direction === "higher" ? value >= target : value <= target;
}
