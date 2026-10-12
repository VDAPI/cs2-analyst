/**
 * The "what to improve" report: groups a player's findings by type into
 * issues, attaches the match metric behind each one, ranks them and picks the
 * top 3. Pure (no DB), covered by `npm run test:findings`.
 *
 * Ranking: each issue scores weight × (moment score + metric score). Moments
 * add up with diminishing returns (ten small slips don't beat one costly habit)
 * and a metric judged bad/warn over enough samples adds on top, so an issue can
 * reach the top 3 from the match number alone (e.g. low first-bullet accuracy).
 */
import { aimMetrics, type MetricStatus, type PlayerAim } from "@/lib/analysis/aim";
import { pct } from "@/lib/analysis/movement";
import {
  CATEGORIES,
  FINDING_TYPES,
  findingDef,
  type CategoryDef,
  type FindingSeverity,
  type FindingType,
  type FindingTypeDef,
} from "./catalog";

/** Fewer samples than this → a percentage/median metric is not judged. */
export const MIN_METRIC_SAMPLES = 5;
export const TOP_ISSUES = 3;

export interface ReportMetric {
  key: string;
  type: FindingType;
  label: string;
  value: number | null;
  unit: string;
  threshold: string;
  status: MetricStatus;
  samples: number;
  hint: string;
}

/** Columns of MechanicsStats the report needs. */
export interface MechanicsSummary {
  firstShots: number;
  firstShotsMoving: number;
  firstShotHits: number;
  hits: number;
  headHits: number;
  counterStrafes: number;
  counterStrafeAvgMs: number | null;
}

export type AimSummary = Omit<PlayerAim, "steamId" | "moments" | "peekTypes" | "visibility">;

const lower = (v: number | null, good: number, warn: number): MetricStatus =>
  v == null ? "none" : v <= good ? "good" : v <= warn ? "warn" : "bad";
const higher = (v: number | null, good: number, warn: number): MetricStatus =>
  v == null ? "none" : v >= good ? "good" : v >= warn ? "warn" : "bad";
const rounded = (v: number | null) => (v == null ? null : Math.round(v));

const AIM_METRIC_TYPE: Record<string, FindingType> = {
  crosshair: "crosshair",
  reaction: "reaction",
  ttd: "ttd",
  spray: "spray",
  preaim: "preaim",
  overflick: "overflick",
  dry_peek: "dry_peek",
  noise: "noise",
  jump: "jump",
  reload: "reload",
};

/** Every judged number of the match for one player, each tied to a finding type. */
export function playerMetrics(mech: MechanicsSummary | null, aim: AimSummary | null): ReportMetric[] {
  const out: ReportMetric[] = [];
  if (mech) {
    const moving = rounded(pct(mech.firstShotsMoving, mech.firstShots));
    const first = rounded(pct(mech.firstShotHits, mech.firstShots));
    const hs = rounded(pct(mech.headHits, mech.hits));
    out.push(
      {
        key: "moving_first", type: "moving_shot", label: "Pierwsze strzały w ruchu", value: moving, unit: "%",
        threshold: "≤ 10% dobrze, > 25% źle", status: lower(moving, 10, 25), samples: mech.firstShots,
        hint: `${mech.firstShotsMoving} z ${mech.firstShots} pojedynków zaczętych w ruchu.`,
      },
      {
        key: "strafe", type: "late_strafe", label: "Czas counter-strafe", value: rounded(mech.counterStrafeAvgMs), unit: "ms",
        threshold: "≤ 110 ms dobrze, > 160 ms źle", status: lower(mech.counterStrafeAvgMs, 110, 160),
        samples: mech.counterStrafes, hint: "Średni czas od biegu do prędkości, przy której strzał jest celny.",
      },
      {
        key: "first_bullet", type: "first_bullet", label: "Celność 1. kuli", value: first, unit: "%",
        threshold: "≥ 35% dobrze, < 22% źle", status: higher(first, 35, 22), samples: mech.firstShots,
        hint: `${mech.firstShotHits} z ${mech.firstShots} pierwszych kul w pojedynkach trafiło.`,
      },
      {
        key: "hs", type: "headshots", label: "Trafienia w głowę", value: hs, unit: "%",
        threshold: "≥ 45% dobrze, < 30% źle", status: higher(hs, 45, 30), samples: mech.hits,
        hint: `${mech.headHits} z ${mech.hits} trafień w głowę.`,
      }
    );
  }
  if (aim) {
    for (const m of aimMetrics(aim)) {
      const type = AIM_METRIC_TYPE[m.key];
      if (!type) continue;
      out.push({
        key: m.key, type, label: m.label, value: m.value, unit: m.unit,
        threshold: m.threshold, status: m.status, samples: m.samples, hint: m.hint,
      });
    }
  }
  // Rates and medians over a handful of samples say nothing yet.
  return out.map((m) =>
    m.unit !== "" && m.samples < MIN_METRIC_SAMPLES ? { ...m, status: "none" as MetricStatus } : m
  );
}

export function formatMetric(m: Pick<ReportMetric, "value" | "unit">): string {
  if (m.value == null) return "–";
  if (m.unit === "") return String(m.value);
  return m.unit === "°" || m.unit === "%" ? `${m.value}${m.unit}` : `${m.value} ${m.unit}`;
}

/** The finding fields the report reads; stored rows and drafts both fit. */
export interface ReportFinding {
  type: string;
  severity: string;
  costly: boolean;
  roundNumber: number;
  tick: number;
}

export interface ReportIssue<F extends ReportFinding = ReportFinding> {
  type: string;
  def: FindingTypeDef;
  findings: F[];
  high: number;
  medium: number;
  low: number;
  costly: number;
  severity: FindingSeverity;
  metric: ReportMetric | null;
  score: number;
}

export interface PlayerReport<F extends ReportFinding = ReportFinding> {
  /** Every issue with moments or a judged metric, best first. */
  issues: ReportIssue<F>[];
  /** Up to TOP_ISSUES issues worth working on first. */
  top: ReportIssue<F>[];
  /** Metrics judged good. */
  strengths: ReportMetric[];
  byCategory: Array<{ category: CategoryDef; issues: ReportIssue<F>[] }>;
  totals: { findings: number; high: number; medium: number; low: number; costly: number; rounds: number };
}

const SEVERITY_POINTS: Record<string, number> = { high: 3, medium: 1.5, low: 0.4 };
const METRIC_POINTS: Record<MetricStatus, number> = { bad: 5, warn: 2, good: -4, none: 0 };
export const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function scoreIssue(
  def: FindingTypeDef,
  counts: { high: number; medium: number; low: number; costly: number },
  metric: ReportMetric | null
): number {
  const pts =
    counts.high * SEVERITY_POINTS.high +
    counts.medium * SEVERITY_POINTS.medium +
    counts.low * SEVERITY_POINTS.low +
    counts.costly;
  const momentScore = 4 * Math.log2(1 + pts);
  const metricScore = metric ? METRIC_POINTS[metric.status] : 0;
  return Math.round(def.weight * (momentScore + metricScore) * 10) / 10;
}

export function buildReport<F extends ReportFinding>(findings: F[], metrics: ReportMetric[]): PlayerReport<F> {
  const byType = new Map<string, F[]>();
  for (const f of findings) {
    const list = byType.get(f.type) ?? [];
    list.push(f);
    byType.set(f.type, list);
  }
  const metricOf = new Map(metrics.map((m) => [m.type as string, m]));
  const types = new Set<string>([...byType.keys(), ...metrics.filter((m) => m.status !== "none").map((m) => m.type)]);

  const issues: ReportIssue<F>[] = [];
  for (const type of types) {
    const list = [...(byType.get(type) ?? [])].sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
        Number(b.costly) - Number(a.costly) ||
        a.roundNumber - b.roundNumber ||
        a.tick - b.tick
    );
    const counts = {
      high: list.filter((f) => f.severity === "high").length,
      medium: list.filter((f) => f.severity === "medium").length,
      low: list.filter((f) => f.severity === "low").length,
      costly: list.filter((f) => f.costly).length,
    };
    const metric = metricOf.get(type) ?? null;
    const def = findingDef(type);
    const severity: FindingSeverity =
      metric?.status === "bad" || counts.high >= 2
        ? "high"
        : metric?.status === "warn" || counts.high >= 1 || counts.medium >= 2
          ? "medium"
          : "low";
    issues.push({ type, def, findings: list, ...counts, severity, metric, score: scoreIssue(def, counts, metric) });
  }
  issues.sort((a, b) => b.score - a.score || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  // Worth working on: not judged good, and something more than a stray hint.
  const actionable = issues.filter(
    (i) =>
      i.score > 0 &&
      i.metric?.status !== "good" &&
      (i.high + i.medium > 0 || i.metric?.status === "bad" || i.metric?.status === "warn")
  );

  const strengths = metrics
    .filter((m) => m.status === "good")
    .sort((a, b) => (FINDING_TYPES[b.type]?.weight ?? 1) - (FINDING_TYPES[a.type]?.weight ?? 1));

  const byCategory = CATEGORIES.map((category) => ({
    category,
    issues: issues.filter((i) => i.def.category === category.key && (i.findings.length > 0 || i.metric?.status !== "good")),
  }));

  return {
    issues,
    top: actionable.slice(0, TOP_ISSUES),
    strengths,
    byCategory,
    totals: {
      findings: findings.length,
      high: findings.filter((f) => f.severity === "high").length,
      medium: findings.filter((f) => f.severity === "medium").length,
      low: findings.filter((f) => f.severity === "low").length,
      costly: findings.filter((f) => f.costly).length,
      rounds: new Set(findings.map((f) => f.roundNumber)).size,
    },
  };
}
