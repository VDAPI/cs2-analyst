"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, SectionTitle } from "@/components/ui";
import { PLAYER_COLORS } from "../../../compare-ui";
import type { RadarDataPoint } from "../../../types";

interface RadarComparisonChartProps {
  player1Name: string;
  player2Name: string;
  data: RadarDataPoint[];
}

function CustomTooltip({
  active,
  payload,
  player1Name,
  player2Name,
}: {
  active?: boolean;
  payload?: Array<{ payload: RadarDataPoint }>;
  player1Name: string;
  player2Name: string;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="max-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-[var(--text-primary)]">{d.stat}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PLAYER_COLORS.p1 }} />
          <span className="truncate text-[var(--text-secondary)]">{player1Name}</span>
          <span className="stat-inline ml-auto pl-2 text-[var(--text-primary)]">{d.raw1}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PLAYER_COLORS.p2 }} />
          <span className="truncate text-[var(--text-secondary)]">{player2Name}</span>
          <span className="stat-inline ml-auto pl-2 text-[var(--text-primary)]">{d.raw2}</span>
        </div>
      </div>
    </div>
  );
}

export function RadarComparisonChart({
  player1Name,
  player2Name,
  data,
}: RadarComparisonChartProps) {
  return (
    <Card>
      <SectionTitle>Radar statystyk</SectionTitle>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PLAYER_COLORS.p1 }} />
          <span className="max-w-[10rem] truncate text-[var(--text-secondary)]">{player1Name}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PLAYER_COLORS.p2 }} />
          <span className="max-w-[10rem] truncate text-[var(--text-secondary)]">{player2Name}</span>
        </div>
      </div>
      <div className="h-[280px] sm:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="62%" margin={{ top: 8, right: 28, bottom: 8, left: 28 }}>
            <PolarGrid stroke="var(--border)" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="stat"
              tick={{ fill: "var(--text-secondary)", fontSize: 12, fontFamily: "var(--font-sans)" }}
            />
            <Radar
              name={player1Name}
              dataKey="player1"
              stroke={PLAYER_COLORS.p1}
              fill={PLAYER_COLORS.p1}
              fillOpacity={0.22}
              strokeWidth={2.5}
            />
            <Radar
              name={player2Name}
              dataKey="player2"
              stroke={PLAYER_COLORS.p2}
              fill={PLAYER_COLORS.p2}
              fillOpacity={0.14}
              strokeWidth={2.5}
            />
            <Tooltip
              content={<CustomTooltip player1Name={player1Name} player2Name={player2Name} />}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Raw values, readable without hovering or tapping the chart */}
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.map((d) => (
          <div key={d.stat} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5">
            <dt className="label-overline text-[var(--text-tertiary)]">{d.stat}</dt>
            <dd className="flex items-baseline justify-between gap-2 font-mono text-sm tabular-nums">
              <span style={{ color: PLAYER_COLORS.p1 }}>{d.raw1}</span>
              <span style={{ color: PLAYER_COLORS.p2 }}>{d.raw2}</span>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
