"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
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
  /** Fixed chart height; by default it grows with the number of weapons. */
  height?: number;
}

const AXIS_TICK = {
  fill: "var(--text-tertiary)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
};

/**
 * Kills per weapon as horizontal bars — weapon names stay readable on a
 * 360 px screen, where angled column labels would collide.
 */
export function WeaponBarChart({ data, height }: WeaponBarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)]">Brak danych o broniach</p>;
  }

  const chartHeight = height ?? Math.max(160, data.length * 34 + 24);

  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 md:p-4">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 36, left: 0, bottom: 4 }}
          barCategoryGap="22%"
          accessibilityLayer
        >
          <defs>
            <linearGradient id="weaponBarGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.95} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="displayName"
            tick={{ ...AXIS_TICK, fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval={0}
            width={100}
          />
          <Tooltip cursor={{ fill: "rgba(190,160,255,0.06)" }} content={<WeaponTooltip />} />
          <Bar dataKey="kills" name="Zabójstwa" radius={[0, 4, 4, 0]} fill="url(#weaponBarGrad)">
            <LabelList
              dataKey="kills"
              position="right"
              fill="var(--text-secondary)"
              fontSize={12}
              fontFamily="var(--font-mono)"
            />
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
    <div className="rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-3 py-2 shadow-[var(--shadow-md)] backdrop-blur-md">
      <p className="font-display text-sm font-semibold text-[var(--text-primary)]">{w.displayName}</p>
      <div className="mt-1 space-y-0.5 font-mono text-xs tabular-nums">
        <div className="flex items-center justify-between gap-6">
          <span className="text-[var(--text-tertiary)]">Zabójstwa</span>
          <span className="text-[var(--text-primary)]">{w.kills}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-[var(--text-tertiary)]">HS%</span>
          <span className="text-[var(--text-primary)]">
            {w.kills > 0 ? `${w.hsPercent.toFixed(0)}%` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-[var(--text-tertiary)]">HS / zabójstwa</span>
          <span className="text-[var(--text-secondary)]">
            {w.headshots} / {w.kills}
          </span>
        </div>
      </div>
    </div>
  );
}
