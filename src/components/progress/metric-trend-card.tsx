"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { CANVAS_COLORS } from "@/lib/canvas/palette";
import { formatDelta, formatProgressValue } from "@/lib/progress/format";
import type { MetricSeries, SeriesPoint } from "@/lib/progress/view";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils/cn";

/** Dot fill per verdict; SVG attributes can't read CSS vars (see palette.ts). */
const STATUS_FILL: Record<string, string> = {
  good: CANVAS_COLORS.good,
  warn: CANVAS_COLORS.warning,
  bad: CANVAS_COLORS.mistake,
  none: CANVAS_COLORS.textTertiary,
};

const STATUS_TEXT: Record<string, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warning)]",
  bad: "text-[var(--mistake)]",
  none: "text-[var(--text-tertiary)]",
};

const STATUS_KEY: Record<string, MessageKey> = {
  good: "progress.statusGood",
  warn: "progress.statusWarn",
  bad: "progress.statusBad",
  none: "progress.statusNone",
};

export const metricLabel = (t: TFunction, key: string) => t(`progressMetrics.${key}` as MessageKey);

function PointTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: Array<{ payload: SeriesPoint }>;
  series: MetricSeries;
}) {
  const t = useT();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-lg">
      <p className="text-xs text-[var(--text-tertiary)]">
        {mapDisplayName(p.map)} · <span className="font-mono">{formatDate(p.date)}</span>
      </p>
      <p className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
        {formatProgressValue(series, p.value)}{" "}
        <span className={cn("font-sans text-xs font-normal", STATUS_TEXT[p.status])}>{t(STATUS_KEY[p.status])}</span>
      </p>
    </div>
  );
}

function StatusDot(props: { cx?: number; cy?: number; payload?: SeriesPoint; r?: number }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload || payload.value == null) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={props.r ?? 4.5}
      fill={STATUS_FILL[payload.status]}
      stroke={CANVAS_COLORS.surface1}
      strokeWidth={2}
    />
  );
}

/** Trend arrow: up = better, matching the charts (which flip "lower is better" metrics). */
export function TrendPill({ series, className }: { series: MetricSeries; className?: string }) {
  const t = useT();
  const tr = series.trend;
  if (!tr) return <span className={cn("text-xs text-[var(--text-tertiary)]", className)}>{t("progress.noTrend")}</span>;
  const Icon = tr.verdict === "flat" ? ArrowRight : tr.verdict === "better" ? ArrowUpRight : ArrowDownRight;
  const tone =
    tr.verdict === "better"
      ? "bg-[var(--good-muted)] text-[var(--good)]"
      : tr.verdict === "worse"
        ? "bg-[var(--mistake-muted)] text-[var(--mistake)]"
        : "bg-[var(--surface-3)] text-[var(--text-secondary)]";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tone, className)}
      title={t("progress.trendDelta", { delta: formatDelta(series, tr.delta) })}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {t(tr.verdict === "better" ? "progress.better" : tr.verdict === "worse" ? "progress.worse" : "progress.flat")}
    </span>
  );
}

/** One metric over the window: window verdict, trend arrow and a dot per match. */
export function MetricTrendCard({
  series,
  goal = null,
  className,
  height = 110,
}: {
  series: MetricSeries;
  goal?: number | null;
  className?: string;
  height?: number;
}) {
  const t = useT();
  const label = metricLabel(t, series.key);
  const values = series.points.map((p) => p.value).filter((v): v is number => v != null);
  const lo = Math.min(...values, ...(goal != null ? [goal] : []));
  const hi = Math.max(...values, ...(goal != null ? [goal] : []));
  const pad = (hi - lo) * 0.15 || Math.max(1, Math.abs(hi) * 0.1);

  return (
    <div className={cn("min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm text-[var(--text-secondary)]">{label}</p>
        <TrendPill series={series} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("font-mono text-2xl font-semibold tabular-nums", STATUS_TEXT[series.window.status] ?? "text-[var(--text-primary)]")}>
          {formatProgressValue(series, series.window.value)}
        </span>
        <span className={cn("text-xs", STATUS_TEXT[series.window.status])}>{t(STATUS_KEY[series.window.status])}</span>
      </div>
      {series.trend && (
        <p className="text-xs text-[var(--text-tertiary)]">
          <span className="font-mono">{t("progress.trendDelta", { delta: formatDelta(series, series.trend.delta) })}</span>
        </p>
      )}
      {values.length === 0 ? (
        <div className="flex items-center justify-center text-xs text-[var(--text-tertiary)]" style={{ height }}>
          {t("progress.noData")}
        </div>
      ) : (
        <div role="img" aria-label={t("progress.chartLabel", { metric: label, n: series.points.length })}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={series.points} margin={{ top: 10, right: 8, bottom: 6, left: 8 }}>
              <YAxis hide domain={[lo - pad, hi + pad]} reversed={series.direction === "lower"} />
              {goal != null && (
                <ReferenceLine y={goal} stroke={CANVAS_COLORS.accent2} strokeDasharray="4 4" strokeWidth={1.5} ifOverflow="extendDomain" />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={CANVAS_COLORS.accent}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={<StatusDot />}
                activeDot={<StatusDot r={6.5} />}
              />
              <Tooltip
                content={<PointTooltip series={series} />}
                cursor={{ stroke: CANVAS_COLORS.axis, strokeWidth: 1 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
