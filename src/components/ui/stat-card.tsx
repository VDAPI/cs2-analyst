import { Card } from "./card";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number; // positive = good, negative = bad
  accentColor?: string;
}

export function StatCard({ label, value, trend, accentColor }: StatCardProps) {
  return (
    <Card
      className="border-t-2"
      style={{ borderTopColor: accentColor ?? "var(--accent)" }}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="stat-number mt-2 text-[var(--text-primary)]">{value}</p>
      {trend !== undefined && (
        <p
          className={`mt-1 text-xs font-medium ${
            trend >= 0 ? "text-[var(--success)]" : "text-[var(--error)]"
          }`}
        >
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
        </p>
      )}
    </Card>
  );
}
