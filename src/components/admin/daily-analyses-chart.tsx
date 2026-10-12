"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyCount } from "@/lib/admin/metrics";

const AXIS_TICK = {
  fill: "var(--text-tertiary)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
};

const SERIES = [
  { key: "completed", name: "Gotowe", color: "var(--good)" },
  { key: "failed", name: "Nieudane", color: "var(--mistake)" },
  { key: "pending", name: "W toku", color: "var(--accent)" },
] as const;

/** "2026-10-12" → "12.10" */
function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}.${m}`;
}

/** Analyses started per day, stacked by how they ended. */
export function DailyAnalysesChart({ data }: { data: DailyCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: -20, bottom: 0 }} accessibilityLayer>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tick={AXIS_TICK}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          minTickGap={16}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(190,160,255,0.06)" }}
          labelFormatter={(d) => shortDay(String(d))}
          contentStyle={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
          labelStyle={{ color: "var(--text-primary)" }}
          itemStyle={{ color: "var(--text-secondary)" }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }}
        />
        {SERIES.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="a"
            fill={s.color}
            radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : 0}
            maxBarSize={18}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
