import { Card } from "@/components/ui";
import type { StatRow } from "../../../types";

interface StatComparisonProps {
  player1Name: string;
  player2Name: string;
  stats: StatRow[];
}

export function StatComparison({
  player1Name,
  player2Name,
  stats,
}: StatComparisonProps) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
        Stats Breakdown
      </h2>

      {/* Column headers */}
      <div className="mb-3 flex items-center px-2 text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
        <span className="flex-1 text-right" style={{ color: "var(--ct-blue)" }}>
          {player1Name}
        </span>
        <span className="w-32 shrink-0 text-center">Stat</span>
        <span className="flex-1" style={{ color: "var(--t-gold)" }}>
          {player2Name}
        </span>
      </div>

      <div className="space-y-1">
        {stats.map((stat) => {
          const total = stat.p1Value + stat.p2Value;
          const p1Pct = total > 0 ? (stat.p1Value / total) * 100 : 50;
          const p2Pct = total > 0 ? (stat.p2Value / total) * 100 : 50;

          const p1Better = stat.higherIsBetter
            ? stat.p1Value > stat.p2Value
            : stat.p1Value < stat.p2Value;
          const p2Better = stat.higherIsBetter
            ? stat.p2Value > stat.p1Value
            : stat.p2Value < stat.p1Value;
          const equal = stat.p1Value === stat.p2Value;

          return (
            <div key={stat.label} className="group">
              <div className="flex items-center rounded-lg px-2 py-2 transition-colors hover:bg-[rgba(255,255,255,0.02)]">
                {/* P1 value */}
                <span
                  className={`stat-inline flex-1 text-right text-sm font-semibold ${
                    equal
                      ? "text-[var(--text-primary)]"
                      : p1Better
                        ? "text-[var(--success)]"
                        : "text-[var(--text-secondary)]"
                  }`}
                >
                  {stat.format(stat.p1Value)}
                </span>

                {/* Label */}
                <span className="w-32 shrink-0 text-center text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                  {stat.label}
                </span>

                {/* P2 value */}
                <span
                  className={`stat-inline flex-1 text-sm font-semibold ${
                    equal
                      ? "text-[var(--text-primary)]"
                      : p2Better
                        ? "text-[var(--success)]"
                        : "text-[var(--text-secondary)]"
                  }`}
                >
                  {stat.format(stat.p2Value)}
                </span>
              </div>

              {/* Proportional bar */}
              <div className="mx-2 flex h-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="rounded-l-full transition-all duration-300"
                  style={{
                    width: `${p1Pct}%`,
                    backgroundColor: "var(--ct-blue)",
                    opacity: p1Better ? 0.7 : 0.3,
                  }}
                />
                <div
                  className="rounded-r-full transition-all duration-300"
                  style={{
                    width: `${p2Pct}%`,
                    backgroundColor: "var(--t-gold)",
                    opacity: p2Better ? 0.7 : 0.3,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
