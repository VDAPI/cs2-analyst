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
import { Card, SectionTitle } from "@/components/ui";
import { PLAYER_COLORS } from "../../../compare-ui";

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
      <p className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{d.date}</p>
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
  const avg = data.length > 0 ? data.reduce((sum, d) => sum + d.hltv, 0) / data.length : null;

  return (
    <div className="min-w-0 rounded-lg bg-[var(--surface-2)] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-semibold" style={{ color }}>
          {name}
        </p>
        {avg !== null && (
          <p className="shrink-0 text-xs text-[var(--text-tertiary)]">
            śr. <span className="font-mono tabular-nums text-[var(--text-primary)]">{avg.toFixed(2)}</span>
          </p>
        )}
      </div>
      {data.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-[var(--text-tertiary)]">
          Brak ostatnich meczów
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <YAxis domain={[0.4, 2.0]} hide />
            <XAxis dataKey="date" hide />
            <ReferenceLine y={1.0} stroke="var(--border-hover)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="hltv"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 4, fill: color, stroke: "var(--surface-2)", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: color }}
            />
            <Tooltip content={<FormTooltip />} />
          </LineChart>
        </ResponsiveContainer>
      )}
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
      <SectionTitle>Ostatnia forma</SectionTitle>
      <p className="-mt-1 mb-4 text-xs text-[var(--text-tertiary)]">
        Ostatnie 5 meczów — HLTV Rating (linia odniesienia 1.0)
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Sparkline data={player1Form} color={PLAYER_COLORS.p1} name={player1Name} />
        <Sparkline data={player2Form} color={PLAYER_COLORS.p2} name={player2Name} />
      </div>
    </Card>
  );
}
