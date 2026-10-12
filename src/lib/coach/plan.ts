/**
 * Weekly training plan (S15). Built from the player's last matches: the
 * issues the report would rank first over the whole window (re-ranked by the
 * player's ratings of earlier advice), a numeric target for each, drills from
 * the drill library and a 7-day schedule. Deterministic and pure, so the plan
 * exists without the Claude API; the AI only writes the prose around it and
 * can't change a target, a drill or a day. Covered by `npm run test:coach`.
 */
import type { MetricStatus } from "@/lib/analysis/aim";
import { findingDef, type FindingCategory } from "@/lib/findings/catalog";
import { buildReport, isActionable, playerMetrics, SEVERITY_RANK, type ReportIssue } from "@/lib/findings/report";
import {
  aggregateAim,
  aggregateMechanics,
  aggregateTactics,
  aggregateUtility,
  aggregateWindow,
  meets,
  progressMetric,
  type Direction,
  type MatchInput,
  type ProgressMetricDef,
  type ProgressMetricKey,
} from "@/lib/progress/metrics";
import { DRILLS, drillsFor, type DrillId } from "./drills";
import { rerank, type FeedbackWeights } from "./ranking";

/** Bump when the plan's shape or rules change; stored plans are rebuilt. */
export const PLAN_VERSION = 1;
export const PLAN_WINDOW = 10;
export const FOCUS_COUNT = 3;
/** At most this many focuses from one category, so the week isn't one-note. */
const MAX_PER_CATEGORY = 2;
const DRILLS_PER_FOCUS = 2;
const EXAMPLES_PER_FOCUS = 2;
const MATCH_MINUTES = 40;
const REVIEW_MINUTES = 20;
/** Weekly target for moments: this share of the current rate per match. */
const MOMENT_CUT = 0.6;

export interface PlanFinding {
  id: string;
  matchId: string;
  steamId: string;
  type: string;
  severity: string;
  costly: boolean;
  roundNumber: number;
  tick: number;
}

export interface PlanInput {
  /** Monday of the plan's week, YYYY-MM-DD. */
  weekStart: string;
  /** The player's latest matches, oldest → newest. */
  matches: MatchInput[];
  /** The player's findings in those matches. */
  findings: PlanFinding[];
  weights?: FeedbackWeights | null;
}

export interface PlanTarget {
  metric: ProgressMetricKey;
  unit: string;
  direction: Direction;
  decimals: number;
  current: number | null;
  /** This week's target: the goal, or a step towards it when it's far. */
  target: number;
  /** The long-term goal (S16 default), when the metric has one. */
  goal: number | null;
  status: MetricStatus;
  samples: number;
}

export interface PlanFocus {
  type: string;
  category: FindingCategory;
  score: number;
  severity: "high" | "medium" | "low";
  metric: PlanTarget | null;
  moments: { total: number; high: number; matches: number; perMatch: number; target: number };
  drills: DrillId[];
  examples: Array<{ id: string; matchId: string; map: string; steamId: string; roundNumber: number; tick: number }>;
}

export type PlanItem =
  | { kind: "drill"; drill: DrillId; focus: string | null; minutes: number }
  | { kind: "match"; focus: string | null; minutes: number }
  | { kind: "review"; focus: null; minutes: number };

export interface PlanDay {
  /** 0 = Monday. */
  day: number;
  items: PlanItem[];
  minutes: number;
}

export interface TrainingPlanContent {
  version: number;
  weekStart: string;
  /** The player's name in their latest match. */
  player: string | null;
  matches: number;
  firstDate: string | null;
  lastDate: string | null;
  /** The player's most played map in the window (for map drills). */
  map: string | null;
  focuses: PlanFocus[];
  days: PlanDay[];
}

const roundTo = (v: number, decimals: number) => {
  const k = 10 ** decimals;
  return Math.round(v * k) / k;
};

/**
 * This week's target for a metric: the goal when it's close, else halfway
 * there. Metrics without a default goal, or with the goal already met while
 * the report still flags them, aim a step better than now (15% / 10%, at
 * least one shown unit).
 */
export function weeklyTarget(def: Pick<ProgressMetricDef, "direction" | "decimals" | "goal" | "unit">, current: number | null): number | null {
  if (current == null) return def.goal ?? null;
  if (def.goal != null && !meets(def.direction, current, def.goal)) {
    const gap = Math.abs(def.goal - current);
    if (gap <= Math.abs(def.goal) * 0.25) return def.goal;
    return roundTo(current + (def.goal - current) / 2, def.decimals);
  }
  return stepBetter(def, current, def.goal != null ? 0.1 : 0.15);
}

function stepBetter(def: Pick<ProgressMetricDef, "direction" | "decimals" | "unit">, current: number, share: number): number {
  const step = 10 ** -def.decimals;
  const better = (v: number) => (def.direction === "higher" ? v : -v);
  let target = roundTo(def.direction === "higher" ? current * (1 + share) : current * (1 - share), def.decimals);
  if (better(target) <= better(current)) target = roundTo(current + (def.direction === "higher" ? step : -step), def.decimals);
  if (target < 0) target = 0;
  if (def.unit === "%" && target > 100) target = 100;
  return target;
}

/** Most frequent map; ties go to the latest. */
export function mainMap(matches: Pick<MatchInput, "map">[]): string | null {
  const count = new Map<string, number>();
  for (const m of matches) count.set(m.map, (count.get(m.map) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const m of matches) {
    const n = count.get(m.map) ?? 0;
    if (n >= bestN) {
      best = m.map;
      bestN = n;
    }
  }
  return best;
}

/** The window's report: summed counts judged once (like /progress), findings of every match. */
export function windowIssues(matches: MatchInput[], findings: PlanFinding[]): ReportIssue<PlanFinding>[] {
  const metrics = playerMetrics(
    aggregateMechanics(matches.flatMap((m) => (m.mech ? [m.mech] : []))),
    aggregateAim(matches.flatMap((m) => (m.aim ? [m.aim] : []))),
    aggregateTactics(matches.flatMap((m) => (m.tactics ? [m.tactics] : []))),
    aggregateUtility(matches.flatMap((m) => (m.utility ? [m.utility] : [])))
  );
  return buildReport(findings, metrics).issues;
}

/** Up to `count` issues to work on, re-ranked by ratings, at most MAX_PER_CATEGORY per category. */
export function pickFocuses<I extends { type: string; score: number; def: { category: string } }>(
  issues: I[],
  weights: FeedbackWeights | null | undefined,
  count = FOCUS_COUNT
): I[] {
  const out: I[] = [];
  const perCategory = new Map<string, number>();
  for (const issue of rerank(issues, weights)) {
    const n = perCategory.get(issue.def.category) ?? 0;
    if (n >= MAX_PER_CATEGORY) continue;
    out.push(issue);
    perCategory.set(issue.def.category, n + 1);
    if (out.length >= count) break;
  }
  return out;
}

export function buildTrainingPlan(input: PlanInput): TrainingPlanContent {
  const matches = [...input.matches].sort((a, b) => a.date.localeCompare(b.date) || a.matchId.localeCompare(b.matchId));
  const ids = new Set(matches.map((m) => m.matchId));
  const findings = input.findings.filter((f) => ids.has(f.matchId));
  const order = new Map(matches.map((m, i) => [m.matchId, i]));
  const mapOf = new Map(matches.map((m) => [m.matchId, m.map]));
  const window = aggregateWindow(matches);
  const withFindings = Math.max(1, matches.filter((m) => m.findings).length);
  const map = mainMap(matches);

  const issues = windowIssues(matches, findings).filter(isActionable);
  const picked = pickFocuses(issues, input.weights);

  const usedDrills = new Set<DrillId>();
  const focuses: PlanFocus[] = picked.map((issue) => {
    const metricKey = issue.metric?.key as ProgressMetricKey | undefined;
    const def = metricKey ? progressMetric(metricKey) : undefined;
    let metric: PlanTarget | null = null;
    if (def) {
      const v = window[def.key];
      const target = weeklyTarget(def, v.value);
      if (target != null) {
        metric = {
          metric: def.key,
          unit: def.unit,
          direction: def.direction,
          decimals: def.decimals,
          current: v.value,
          target,
          goal: def.goal ?? null,
          status: v.status,
          samples: v.samples,
        };
      }
    }
    const total = issue.findings.length;
    const perMatch = roundTo(total / withFindings, 1);

    // Prefer drills no other focus took yet, then the best match.
    const candidates = drillsFor(issue.type).map((d) => d.id);
    const drills = [...candidates.filter((d) => !usedDrills.has(d)), ...candidates.filter((d) => usedDrills.has(d))].slice(
      0,
      DRILLS_PER_FOCUS
    );
    for (const d of drills) usedDrills.add(d);

    const examples = [...issue.findings]
      .sort(
        (a, b) =>
          (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
          Number(b.costly) - Number(a.costly) ||
          (order.get(b.matchId) ?? 0) - (order.get(a.matchId) ?? 0) ||
          a.roundNumber - b.roundNumber
      )
      .slice(0, EXAMPLES_PER_FOCUS)
      .map((f) => ({ id: f.id, matchId: f.matchId, map: mapOf.get(f.matchId) ?? "", steamId: f.steamId, roundNumber: f.roundNumber, tick: f.tick }));

    return {
      type: issue.type,
      category: findingDef(issue.type).category,
      score: issue.score,
      severity: issue.severity,
      metric,
      moments: {
        total,
        high: issue.high,
        matches: withFindings,
        perMatch,
        target: roundTo(Math.floor(perMatch * MOMENT_CUT * 10) / 10, 1),
      },
      drills,
      examples,
    };
  });

  return {
    version: PLAN_VERSION,
    weekStart: input.weekStart,
    player: matches[matches.length - 1]?.player.name ?? null,
    matches: matches.length,
    firstDate: matches[0]?.date ?? null,
    lastDate: matches[matches.length - 1]?.date ?? null,
    map,
    focuses,
    days: buildSchedule(focuses),
  };
}

/** Which focus each day trains: the first focus most, then the second, then the third. */
const DAY_FOCUS = [0, 1, 0, 2, 1, 0];
const MATCH_DAYS = new Set([1, 3, 5]);

export function buildSchedule(focuses: Pick<PlanFocus, "type" | "category" | "drills">[]): PlanDay[] {
  const shooting = focuses.some((f) => f.category === "shooting");
  const warmup: DrillId = shooting ? "aim_botz_strafe" : "aim_botz_tap";
  const seen = new Map<string, number>();
  const days: PlanDay[] = [];
  for (let day = 0; day < 7; day++) {
    const items: PlanItem[] = [];
    if (day === 6) {
      items.push({ kind: "drill", drill: warmup, focus: null, minutes: DRILLS[warmup].minutes });
      items.push({ kind: "review", focus: null, minutes: REVIEW_MINUTES });
    } else {
      const focus = focuses.length > 0 ? focuses[DAY_FOCUS[day] % focuses.length] : null;
      let drill: DrillId | null = null;
      if (focus && focus.drills.length > 0) {
        // The warm-up already trains it; rotate through the focus's other drills.
        const rotation: DrillId[] = focus.drills.filter((d) => d !== warmup);
        const list: DrillId[] = rotation.length > 0 ? rotation : focus.drills;
        const n = seen.get(focus.type) ?? 0;
        seen.set(focus.type, n + 1);
        drill = list[n % list.length];
      }
      if (drill !== warmup) items.push({ kind: "drill", drill: warmup, focus: null, minutes: DRILLS[warmup].minutes });
      if (drill) items.push({ kind: "drill", drill, focus: focus!.type, minutes: DRILLS[drill].minutes });
      else if (!focus) items.push({ kind: "drill", drill: "dm_discipline", focus: null, minutes: DRILLS.dm_discipline.minutes });
      if (MATCH_DAYS.has(day)) items.push({ kind: "match", focus: focus?.type ?? null, minutes: MATCH_MINUTES });
    }
    days.push({ day, items, minutes: items.reduce((s, i) => s + i.minutes, 0) });
  }
  return days;
}

/** Monday (YYYY-MM-DD) of the week containing `date`, in Europe/Warsaw. */
export function weekStartOf(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayIndex = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const local = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  local.setUTCDate(local.getUTCDate() - Math.max(0, dayIndex));
  return local.toISOString().slice(0, 10);
}

