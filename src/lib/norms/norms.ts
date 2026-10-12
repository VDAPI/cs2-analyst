/**
 * Norms (S13): how a player's report metrics compare with pro players and
 * with players of the same rank. Pure (no DB), covered by `npm run test:norms`.
 *
 * Every number comes from the same analysis as the report: a pro demo goes
 * through the normal parse pipeline, `buildNormSamples` (build.ts) runs the
 * S8–S12 analyses on it once for the whole match and once per side, and
 * `playerMetrics` turns each player into a `NormSample`. `aggregateNorms`
 * then turns the samples into percentiles per pool (pro, every player, rank
 * bucket), map, side and situation (weapon class for the shooting metrics).
 *
 * Until enough pro samples exist for a metric, `proNorm` falls back to the
 * reference values in reference.ts and says so (`source: "reference"`).
 */
import { MIN_METRIC_SAMPLES, type ReportMetric } from "@/lib/findings/report";
import { pct, type WeaponMechanics } from "@/lib/analysis/movement";
import { REFERENCE_NORMS } from "./reference";

/** Bump when sampling or aggregation changes; old samples are rebuilt. */
export const NORMS_VERSION = 1;

export type NormSide = "CT" | "T" | "all";
export const NORM_SIDES: NormSide[] = ["all", "CT", "T"];

export type Situation = "all" | "rifle" | "awp" | "smg" | "pistol";
export const SITUATIONS: Situation[] = ["all", "rifle", "awp", "smg", "pistol"];

/** Fewer player-matches than this in a map/side cell → use the all-maps cell (or the reference). */
export const MIN_NORM_N = 8;
/** Cells with fewer player-matches than this are not stored at all. */
export const MIN_STORED_N = 3;

export type MetricDirection = "higher" | "lower";

/** Which way is better, for every metric `playerMetrics` can return. */
export const METRIC_DIRECTION: Record<string, MetricDirection> = {
  moving_first: "lower",
  strafe: "lower",
  first_bullet: "higher",
  hs: "higher",
  crosshair: "lower",
  reaction: "lower",
  ttd: "lower",
  spray: "higher",
  preaim: "higher",
  overflick: "lower",
  dry_peek: "lower",
  noise: "lower",
  jump: "lower",
  reload: "lower",
  traded_deaths: "higher",
  trades: "higher",
  opening: "higher",
  same_spot: "lower",
  bad_force: "lower",
  flash_blind: "higher",
  team_flash: "lower",
  flash_follow: "higher",
  smoke_wasted: "lower",
  he_damage: "higher",
  molotov_damage: "higher",
  unused_utility: "lower",
};

/** Shooting metrics that also get a norm per weapon class. */
export const WEAPON_METRICS = ["moving_first", "first_bullet", "hs"] as const;

const RIFLES = new Set(["ak47", "m4a1", "m4a1_silencer", "galilar", "famas", "sg556", "aug"]);
const SNIPERS = new Set(["awp"]);
const SMGS = new Set(["mac10", "mp9", "mp7", "mp5sd", "ump45", "p90", "bizon"]);
const PISTOLS = new Set([
  "glock", "hkp2000", "usp_silencer", "p250", "elite", "fiveseven", "tec9", "cz75a", "deagle", "revolver",
]);

/** Weapon class of a normalized weapon name (movement.ts), or null for the rest (shotguns, autos, scout). */
export function weaponClass(weapon: string): Exclude<Situation, "all"> | null {
  if (RIFLES.has(weapon)) return "rifle";
  if (SNIPERS.has(weapon)) return "awp";
  if (SMGS.has(weapon)) return "smg";
  if (PISTOLS.has(weapon)) return "pistol";
  return null;
}

// ─── Samples ─────────────────────────────────────────────

/** `"<metric>@<situation>"` → [value, samples behind it]. */
export type SampleMetrics = Record<string, [number, number]>;

export const sampleKey = (metric: string, situation: Situation = "all") => `${metric}@${situation}`;

export function parseSampleKey(key: string): { metric: string; situation: Situation } {
  const at = key.lastIndexOf("@");
  if (at < 0) return { metric: key, situation: "all" };
  return { metric: key.slice(0, at), situation: key.slice(at + 1) as Situation };
}

/** A rate or median over fewer samples than the report judges says nothing; counts always count. */
const usable = (unit: string, value: number | null, samples: number): value is number =>
  value != null && Number.isFinite(value) && (unit === "" || samples >= MIN_METRIC_SAMPLES);

/**
 * One player's metrics for one match (or side) as stored in a NormSample:
 * every report metric with enough samples, plus the shooting metrics per
 * weapon class.
 */
export function metricsToSample(metrics: ReportMetric[], weapons: WeaponMechanics[] = []): SampleMetrics {
  const out: SampleMetrics = {};
  for (const m of metrics) {
    if (!(m.key in METRIC_DIRECTION)) continue;
    if (usable(m.unit, m.value, m.samples)) out[sampleKey(m.key)] = [m.value, m.samples];
  }
  const byClass = new Map<Situation, { first: number; moving: number; firstHits: number; hits: number; head: number }>();
  for (const w of weapons) {
    const cls = weaponClass(w.weapon);
    if (!cls) continue;
    const acc = byClass.get(cls) ?? { first: 0, moving: 0, firstHits: 0, hits: 0, head: 0 };
    acc.first += w.firstShots;
    acc.moving += w.firstShotsMoving;
    acc.firstHits += w.firstShotHits;
    acc.hits += w.hits;
    acc.head += w.headHits;
    byClass.set(cls, acc);
  }
  for (const [cls, a] of byClass) {
    const put = (metric: string, value: number | null, samples: number) => {
      if (usable("%", value, samples)) out[sampleKey(metric, cls)] = [Math.round(value), samples];
    };
    put("moving_first", pct(a.moving, a.first), a.first);
    put("first_bullet", pct(a.firstHits, a.first), a.first);
    put("hs", pct(a.head, a.hits), a.hits);
  }
  return out;
}

// ─── Ranks ───────────────────────────────────────────────

export type RankType = "faceit" | "premier" | "competitive";

/** Premier CS Rating is bucketed by its colour bands (5 000 wide, 30 000+ together). */
export const PREMIER_BUCKET = 5000;
const PREMIER_TOP = 30000;

/** The rank pool a player belongs to, e.g. "faceit:7", "premier:15000", or null when unknown. */
export function rankBucket(type: string | null | undefined, value: number | null | undefined): string | null {
  if (!type || value == null || !Number.isFinite(value) || value <= 0) return null;
  if (type === "faceit") return value >= 1 && value <= 10 ? `faceit:${Math.round(value)}` : null;
  if (type === "premier") return `premier:${Math.min(PREMIER_TOP, Math.floor(value / PREMIER_BUCKET) * PREMIER_BUCKET)}`;
  if (type === "competitive") return value >= 1 && value <= 18 ? `competitive:${Math.round(value)}` : null;
  return null;
}

export function parseRankBucket(bucket: string): { type: RankType; value: number } | null {
  const [type, raw] = bucket.split(":");
  const value = Number(raw);
  if ((type === "faceit" || type === "premier" || type === "competitive") && Number.isFinite(value)) {
    return { type, value };
  }
  return null;
}

/** CS2 competitive skill groups 1–18 (m_iCompetitiveRanking with rank type 12). */
export const SKILL_GROUPS = [
  "Silver I", "Silver II", "Silver III", "Silver IV", "Silver Elite", "Silver Elite Master",
  "Gold Nova I", "Gold Nova II", "Gold Nova III", "Gold Nova Master",
  "Master Guardian I", "Master Guardian II", "Master Guardian Elite", "Distinguished Master Guardian",
  "Legendary Eagle", "Legendary Eagle Master", "Supreme Master First Class", "Global Elite",
];

// ─── Aggregation ─────────────────────────────────────────

export interface NormStats {
  n: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
}

export interface NormRow extends NormStats {
  pool: string;
  map: string;
  side: NormSide;
  situation: Situation;
  metric: string;
}

/** Linear-interpolated percentile of an ascending array (q in 0..1). */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function summarize(values: number[]): NormStats {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    p10: r2(percentile(s, 0.1)),
    p25: r2(percentile(s, 0.25)),
    p50: r2(percentile(s, 0.5)),
    p75: r2(percentile(s, 0.75)),
    p90: r2(percentile(s, 0.9)),
    mean: r2(s.reduce((a, b) => a + b, 0) / (s.length || 1)),
  };
}

export interface NormSampleInput {
  map: string;
  side: NormSide;
  pro: boolean;
  /** rankBucket() of the player in that match, null when unknown. */
  rank: string | null;
  metrics: SampleMetrics;
}

/**
 * Percentiles per pool × map × side × situation × metric. Pro samples feed
 * the "pro" pool only; everyone else feeds "all" and their rank bucket. Each
 * sample also counts towards the "all" map.
 */
export function aggregateNorms(samples: Iterable<NormSampleInput>): NormRow[] {
  const cells = new Map<string, number[]>();
  for (const s of samples) {
    const pools = s.pro ? ["pro"] : s.rank ? ["all", s.rank] : ["all"];
    const maps = s.map === "all" ? ["all"] : [s.map, "all"];
    for (const [key, entry] of Object.entries(s.metrics)) {
      const value = entry?.[0];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const { metric, situation } = parseSampleKey(key);
      for (const pool of pools) {
        for (const map of maps) {
          const cell = `${pool}|${map}|${s.side}|${situation}|${metric}`;
          const list = cells.get(cell);
          if (list) list.push(value);
          else cells.set(cell, [value]);
        }
      }
    }
  }
  const rows: NormRow[] = [];
  for (const [cell, values] of cells) {
    if (values.length < MIN_STORED_N) continue;
    const [pool, map, side, situation, metric] = cell.split("|");
    rows.push({ pool, map, side: side as NormSide, situation: situation as Situation, metric, ...summarize(values) });
  }
  return rows;
}

// ─── Lookup and comparison ───────────────────────────────

export interface NormContext {
  map?: string;
  side?: NormSide;
  situation?: Situation;
}

export const normCellKey = (pool: string, map: string, side: string, situation: string, metric: string) =>
  `${pool}|${map}|${side}|${situation}|${metric}`;

/** Lookup over stored MetricNorm rows. */
export class NormTable {
  private cells = new Map<string, NormRow>();

  constructor(rows: Iterable<NormRow>) {
    for (const r of rows) this.cells.set(normCellKey(r.pool, r.map, r.side, r.situation, r.metric), r);
  }

  get size() {
    return this.cells.size;
  }

  /** The exact cell, regardless of size. */
  cell(pool: string, metric: string, ctx: NormContext = {}): NormRow | null {
    return (
      this.cells.get(normCellKey(pool, ctx.map ?? "all", ctx.side ?? "all", ctx.situation ?? "all", metric)) ?? null
    );
  }

  /** The map's cell when it has enough samples, otherwise all maps; null when neither does. */
  get(pool: string, metric: string, ctx: NormContext = {}, minN = MIN_NORM_N): NormRow | null {
    const onMap = ctx.map && ctx.map !== "all" ? this.cell(pool, metric, ctx) : null;
    if (onMap && onMap.n >= minN) return onMap;
    const all = this.cell(pool, metric, { ...ctx, map: "all" });
    return all && all.n >= minN ? all : null;
  }

  /** Pools with any rows, e.g. to list rank buckets that have data. */
  pools(): string[] {
    return [...new Set([...this.cells.values()].map((r) => r.pool))];
  }
}

export interface ProNorm {
  metric: string;
  p25: number;
  p50: number;
  p75: number;
  /** Measured percentiles (only when `source` is "pro"). */
  p10: number | null;
  p90: number | null;
  /** Player-matches behind it (0 for reference values). */
  n: number;
  /** "pro" = measured on pro demos; "reference" = public averages until enough pro demos are in. */
  source: "pro" | "reference";
  /** The map the norm is for, or "all". */
  map: string;
}

/** Pro norm for a metric: measured when the pool has enough samples, otherwise the reference value. */
export function proNorm(table: NormTable | null, metric: string, ctx: NormContext = {}): ProNorm | null {
  const row = table?.get("pro", metric, ctx) ?? null;
  if (row) {
    return { metric, p10: row.p10, p25: row.p25, p50: row.p50, p75: row.p75, p90: row.p90, n: row.n, source: "pro", map: row.map };
  }
  if ((ctx.situation ?? "all") !== "all") return null;
  const ref = REFERENCE_NORMS[metric];
  if (!ref) return null;
  return { metric, p10: null, p90: null, p25: ref.p25, p50: ref.p50, p75: ref.p75, n: 0, source: "reference", map: "all" };
}

/**
 * Share of the pool (0–100) the value is better than, interpolated over the
 * stored percentiles; clamped to 5–95 outside p10–p90. Null without p10/p90.
 */
export function betterThan(
  value: number | null,
  norm: { p10: number | null; p25: number; p50: number; p75: number; p90: number | null },
  direction: MetricDirection
): number | null {
  if (value == null || norm.p10 == null || norm.p90 == null) return null;
  const pts: Array<[number, number]> = [
    [norm.p10, 10], [norm.p25, 25], [norm.p50, 50], [norm.p75, 75], [norm.p90, 90],
  ];
  let below: number;
  if (value <= pts[0][0]) below = value < pts[0][0] ? 5 : 10;
  else if (value >= pts[4][0]) below = value > pts[4][0] ? 95 : 90;
  else {
    below = 50;
    for (let i = 0; i < 4; i++) {
      const [x0, q0] = pts[i];
      const [x1, q1] = pts[i + 1];
      if (value >= x0 && value <= x1) {
        below = x1 === x0 ? (q0 + q1) / 2 : q0 + ((value - x0) / (x1 - x0)) * (q1 - q0);
        break;
      }
    }
  }
  return Math.round(direction === "higher" ? below : 100 - below);
}

/** Where the value sits against a norm's middle half: better, within, or worse. */
export function verdictVs(
  value: number | null,
  norm: { p25: number; p75: number },
  direction: MetricDirection
): "better" | "within" | "worse" | null {
  if (value == null) return null;
  const lo = Math.min(norm.p25, norm.p75);
  const hi = Math.max(norm.p25, norm.p75);
  if (value >= lo && value <= hi) return "within";
  const above = value > hi;
  return above === (direction === "higher") ? "better" : "worse";
}

/** Median of each metric over several samples (e.g. a player's last matches); keys as in SampleMetrics. */
export function medianByMetric(samples: SampleMetrics[]): Record<string, { value: number; matches: number }> {
  const values = new Map<string, number[]>();
  for (const s of samples) {
    for (const [key, entry] of Object.entries(s)) {
      const v = entry?.[0];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const list = values.get(key);
      if (list) list.push(v);
      else values.set(key, [v]);
    }
  }
  const out: Record<string, { value: number; matches: number }> = {};
  for (const [key, list] of values) {
    out[key] = { value: r2(percentile([...list].sort((a, b) => a - b), 0.5)), matches: list.length };
  }
  return out;
}
