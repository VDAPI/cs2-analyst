"use client";

import { lazy, Suspense, type ComponentType } from "react";

/**
 * The Recharts charts, each in a chunk of its own (S28). Recharts is ~100 KB
 * of JS; the pages are server-rendered as before and the browser fetches a
 * chart's code after the page's own scripts, then hydrates the chart.
 */
function lazyChart<P extends object>(load: () => Promise<ComponentType<P>>) {
  const Lazy = lazy(async () => ({ default: await load() }));
  function LazyChart(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  }
  return LazyChart;
}

export const DailyAnalysesChart = lazyChart(() =>
  import("@/components/admin/daily-analyses-chart").then((m) => m.DailyAnalysesChart)
);
export const MetricTrendCard = lazyChart(() =>
  import("@/components/progress/metric-trend-card").then((m) => m.MetricTrendCard)
);
export const WeaponBarChart = lazyChart(() =>
  import("@/components/charts/weapon-bar-chart").then((m) => m.WeaponBarChart)
);
export const EconomyChart = lazyChart(() =>
  import("@/app/(dashboard)/economy/[matchId]/economy-chart").then((m) => m.EconomyChart)
);
export const RecentFormChart = lazyChart(() =>
  import("@/app/(dashboard)/compare/[steamId1]/vs/[steamId2]/recent-form-chart").then((m) => m.RecentFormChart)
);
export const RadarComparisonChart = lazyChart(() =>
  import("@/app/(dashboard)/compare/[steamId1]/vs/[steamId2]/radar-chart").then((m) => m.RadarComparisonChart)
);
