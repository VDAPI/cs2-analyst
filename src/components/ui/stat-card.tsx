import { cn } from "@/lib/utils/cn";
import { Card } from "./card";

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number; // positive = good, negative = bad
  accentColor?: string;
  /** Marks the single best stat on a screen with a lime top border. */
  highlight?: boolean;
  hint?: string;
  className?: string;
}

export function StatCard({ label, value, trend, accentColor, highlight, hint, className }: StatCardProps) {
  return (
    <Card
      className={cn("border-t-2", className)}
      style={{ borderTopColor: accentColor ?? (highlight ? "var(--accent-2)" : "var(--accent)") }}
    >
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p
        className={cn(
          "stat-number mt-2 max-md:text-2xl",
          highlight ? "text-[var(--accent-2)]" : "text-[var(--text-primary)]"
        )}
      >
        {value}
      </p>
      {trend !== undefined && (
        <p
          className={`mt-1 font-mono text-xs font-semibold tabular-nums ${
            trend >= 0 ? "text-[var(--good)]" : "text-[var(--mistake)]"
          }`}
        >
          <span aria-hidden>{trend >= 0 ? "▲" : "▼"}</span>{" "}
          <span className="sr-only">{trend >= 0 ? "w górę" : "w dół"}</span>
          {Math.abs(trend).toFixed(1)}%
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{hint}</p>}
    </Card>
  );
}
