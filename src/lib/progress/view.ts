/**
 * Everything the progress page and the public profile show, from the loaded
 * matches: per-metric series, the window verdict and the trend. Plain JSON,
 * safe to pass to client charts. Pure, covered by `npm run test:progress`.
 */
import type { MetricStatus } from "@/lib/analysis/aim";
import {
  PROGRESS_METRICS,
  aggregateWindow,
  buildHistory,
  computeTrend,
  type Direction,
  type MatchInput,
  type MatchPoint,
  type ProgressMetricKey,
  type Trend,
} from "./metrics";

export interface SeriesPoint {
  matchId: string;
  date: string;
  map: string;
  result: MatchPoint["result"];
  value: number | null;
  status: MetricStatus;
}

export interface MetricSeries {
  key: ProgressMetricKey;
  direction: Direction;
  unit: string;
  decimals: number;
  headline: boolean;
  points: SeriesPoint[];
  window: { value: number | null; status: MetricStatus; samples: number };
  trend: Trend | null;
  /** Any match in the window has a value. */
  hasData: boolean;
}

export interface ProgressView {
  history: MatchPoint[];
  series: MetricSeries[];
  wins: number;
  losses: number;
  draws: number;
}

export function buildProgressView(matches: MatchInput[]): ProgressView {
  const history = buildHistory(matches);
  const window = aggregateWindow(matches);
  const series: MetricSeries[] = PROGRESS_METRICS.map((def) => {
    const points = history.map((h) => ({
      matchId: h.matchId,
      date: h.date,
      map: h.map,
      result: h.result,
      value: h.values[def.key].value,
      status: h.values[def.key].status,
    }));
    return {
      key: def.key,
      direction: def.direction,
      unit: def.unit,
      decimals: def.decimals,
      headline: def.headline === true,
      points,
      window: window[def.key],
      trend: computeTrend(def, points.map((p) => p.value)),
      hasData: points.some((p) => p.value != null),
    };
  });
  return {
    history,
    series,
    wins: history.filter((h) => h.result === "W").length,
    losses: history.filter((h) => h.result === "L").length,
    draws: history.filter((h) => h.result === "D").length,
  };
}
