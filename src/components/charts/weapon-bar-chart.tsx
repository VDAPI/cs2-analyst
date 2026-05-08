"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export interface WeaponStat {
  weapon: string;
  displayName: string;
  kills: number;
  headshots: number;
  hsPercent: number;
}

interface WeaponBarChartProps {
  data: WeaponStat[];
  height?: number;
}

export function WeaponBarChart({ data, height = 280 }: WeaponBarChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-[var(--text-tertiary)]">No weapon data</p>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 8 }}
        >
          <defs>
            <linearGradient id="weaponBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.45} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="displayName"
            tick={{
              fill: "var(--text-tertiary)",
              fontSize: 11,
              fontFamily: "Geist Mono, monospace",
            }}
            axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
            tickLine={false}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{
              fill: "var(--text-tertiary)",
              fontSize: 11,
              fontFamily: "Geist Mono, monospace",
            }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={<WeaponTooltip />}
          />
          <Bar dataKey="kills" radius={[4, 4, 0, 0]} fill="url(#weaponBarGrad)">
            {data.map((entry) => (
              <Cell key={entry.weapon} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayloadItem {
  payload: WeaponStat;
}

function WeaponTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const w = payload[0].payload;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[rgba(15,15,18,0.95)] px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="text-xs font-medium text-[var(--text-primary)]">
        {w.displayName}
      </p>
      <div className="mt-1 space-y-0.5 font-mono text-[11px]">
        <div className="flex items-center justify-between gap-6">
          <span className="text-[var(--text-tertiary)]">Kills</span>
          <span className="text-[var(--text-primary)]">{w.kills}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-[var(--text-tertiary)]">HS%</span>
          <span className="text-[var(--text-primary)]">
            {w.kills > 0 ? `${w.hsPercent.toFixed(0)}%` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-[var(--text-tertiary)]">HS / Kills</span>
          <span className="text-[var(--text-secondary)]">
            {w.headshots} / {w.kills}
          </span>
        </div>
      </div>
    </div>
  );
}
