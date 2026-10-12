/**
 * Goals (S16): a target for one progress metric, met when the average of the
 * last GOAL_WINDOW matches reaches it. Pure, covered by `npm run test:progress`.
 */
import {
  PROGRESS_METRICS,
  aggregateWindow,
  meets,
  progressMetric,
  type MatchInput,
  type MatchPoint,
  type MetricValue,
  type ProgressMetricKey,
} from "./metrics";

export const GOAL_WINDOW = 5;
export const MAX_GOALS = 6;
export const SUGGESTED_GOALS = 3;

export interface GoalInput {
  id: string;
  metric: string;
  target: number;
  achievedAt: string | null;
  createdAt: string;
}

export interface GoalStatus {
  id: string;
  metric: ProgressMetricKey;
  target: number;
  /** Average of the last GOAL_WINDOW matches. */
  current: number | null;
  met: boolean;
  /** Of the last GOAL_WINDOW matches with a value, how many met the target on their own. */
  hits: number;
  counted: number;
  /** 0–1, how far `current` is from the window's worst value towards the target. */
  progress: number;
  achievedAt: string | null;
  /** Met now and never recorded before: the caller stores achievedAt. */
  newlyAchieved: boolean;
}

/** Inputs sorted oldest → newest; points built from the same list. */
export function evaluateGoal(goal: GoalInput, matches: MatchInput[], points: MatchPoint[]): GoalStatus | null {
  const def = progressMetric(goal.metric);
  if (!def) return null;
  const lastMatches = matches.slice(-GOAL_WINDOW);
  const current = aggregateWindow(lastMatches)[def.key].value;
  const values = points
    .slice(-GOAL_WINDOW)
    .map((p) => p.values[def.key].value)
    .filter((v): v is number => v != null);
  const hits = values.filter((v) => meets(def.direction, v, goal.target)).length;
  const met = meets(def.direction, current, goal.target);

  let progress = 0;
  if (current != null) {
    if (met) progress = 1;
    else {
      const worst = def.direction === "higher" ? Math.min(current, ...values) : Math.max(current, ...values);
      // Start of the bar: the worst recent value, or 50% away from the target when there's only one.
      const start = worst !== current ? worst : def.direction === "higher" ? goal.target * 0.5 : goal.target * 1.5;
      const span = goal.target - start;
      progress = span === 0 ? 0 : Math.max(0, Math.min(0.99, (current - start) / span));
    }
  }
  return {
    id: goal.id,
    metric: def.key,
    target: goal.target,
    current,
    met,
    hits,
    counted: values.length,
    progress,
    achievedAt: goal.achievedAt,
    newlyAchieved: met && !goal.achievedAt,
  };
}

/** A valid target for the metric: finite, non-negative, within a sane range. */
export function validTarget(metric: string, target: unknown): target is number {
  const def = progressMetric(metric);
  if (!def || typeof target !== "number" || !Number.isFinite(target) || target < 0) return false;
  if (def.unit === "%") return target <= 100;
  if (def.unit === "°") return target <= 90;
  if (def.unit === "ms") return target <= 5000;
  return target <= 1000;
}

const STATUS_ORDER = { bad: 0, warn: 1, good: 2, none: 3 } as const;

/**
 * Goals worth setting: metrics with a default target the window doesn't meet
 * yet, worst-judged first, skipping metrics that already have a goal.
 */
export function suggestGoals(
  window: Record<ProgressMetricKey, MetricValue>,
  existing: string[]
): Array<{ metric: ProgressMetricKey; target: number; current: number | null }> {
  return PROGRESS_METRICS.filter((d) => d.goal != null && !existing.includes(d.key))
    .map((d) => ({ def: d, v: window[d.key] }))
    .filter(({ def, v }) => v.value != null && v.status !== "none" && !meets(def.direction, v.value, def.goal!))
    .sort((a, b) => STATUS_ORDER[a.v.status] - STATUS_ORDER[b.v.status])
    .slice(0, SUGGESTED_GOALS)
    .map(({ def, v }) => ({ metric: def.key, target: def.goal!, current: v.value }));
}
