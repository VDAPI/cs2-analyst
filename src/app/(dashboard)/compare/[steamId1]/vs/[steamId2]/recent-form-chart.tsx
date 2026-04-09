"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui";

interface RecentMatch {
  date: string;
  hltv: number;
  map: string;
}

interface RecentFormChartProps {
  player1Name: string;
  player2Name: string;
  player1Form: RecentMatch[];
  player2Form: RecentMatch[];
}

function FormTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RecentMatch; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-lg">
      <p className="text-xs text-[var(--text-tertiary)]">{d.map}</p>
      <p className="stat-inline text-sm font-semibold text-[var(--text-primary)]">
        {d.hltv.toFixed(2)}
      </p>
      <p className="text-xs text-[var(--text-disabled)]">{d.date}</p>
    </div>
  );
}

function Sparkline({
  data,
  color,
  name,
}: {
  data: RecentMatch[];
  color: string;
  name: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-xs text-[var(--text-disabled)]">
        No recent matches
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {name}
      </p>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={data}>
          <YAxis
            domain={[0.4, 2.0]}
            hide
          />
          <XAxis dataKey="date" hide />
          <ReferenceLine
            y={1.0}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="3 3"
          />
          <Line
            type="monotone"
            dataKey="hltv"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4, fill: color, stroke: "var(--surface-1)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: color }}
          />
          <Tooltip content={<FormTooltip />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RecentFormChart({
  player1Name,
  player2Name,
  player1Form,
  player2Form,
}: RecentFormChartProps) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
        Recent Form
      </h2>
      <p className="mb-4 text-xs text-[var(--text-tertiary)]">
        Last 5 matches — HLTV Rating (1.0 baseline)
      </p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Sparkline data={player1Form} color="#60a5fa" name={player1Name} />
        <Sparkline data={player2Form} color="#fbbf24" name={player2Name} />
      </div>
    </Card>
  );
}
