"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui";
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-[var(--text-primary)]">
        {d.stat}
      </p>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "#60a5fa" }}
          />
          <span className="text-[var(--text-secondary)]">{player1Name}</span>
          <span className="stat-inline ml-auto text-[var(--text-primary)]">
            {d.raw1}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "#fbbf24" }}
          />
          <span className="text-[var(--text-secondary)]">{player2Name}</span>
          <span className="stat-inline ml-auto text-[var(--text-primary)]">
            {d.raw2}
          </span>
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
      <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
        Stat Radar
      </h2>
      <div className="flex items-center justify-center gap-6 mb-4">
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#60a5fa" }} />
          <span className="text-[var(--text-secondary)]">{player1Name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#fbbf24" }} />
          <span className="text-[var(--text-secondary)]">{player2Name}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="stat"
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          />
          <Radar
            name={player1Name}
            dataKey="player1"
            stroke="#60a5fa"
            fill="#60a5fa"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Radar
            name={player2Name}
            dataKey="player2"
            stroke="#fbbf24"
            fill="#fbbf24"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip
            content={
              <CustomTooltip
                player1Name={player1Name}
                player2Name={player2Name}
              />
            }
          />
        </RadarChart>
      </ResponsiveContainer>
    </Card>
  );
}
