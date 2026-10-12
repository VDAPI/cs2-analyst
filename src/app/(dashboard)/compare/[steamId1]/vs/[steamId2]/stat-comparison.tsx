import { Card, SectionTitle } from "@/components/ui";
import { PLAYER_COLORS } from "../../../compare-ui";
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
      <SectionTitle>Statystyki</SectionTitle>

      {/* Column headers */}
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs font-semibold">
        <span className="truncate" style={{ color: PLAYER_COLORS.p1 }}>
          {player1Name}
        </span>
        <span className="label-overline text-center text-[var(--text-tertiary)]">Statystyka</span>
        <span className="truncate text-right" style={{ color: PLAYER_COLORS.p2 }}>
          {player2Name}
        </span>
      </div>

      <ul className="divide-y divide-[var(--divider)]">
        {stats.map((stat) => {
          const max = Math.max(Math.abs(stat.p1Value), Math.abs(stat.p2Value));
          const p1Pct = max > 0 ? (Math.abs(stat.p1Value) / max) * 100 : 0;
          const p2Pct = max > 0 ? (Math.abs(stat.p2Value) / max) * 100 : 0;

          const p1Better = stat.higherIsBetter
            ? stat.p1Value > stat.p2Value
            : stat.p1Value < stat.p2Value;
          const p2Better = stat.higherIsBetter
            ? stat.p2Value > stat.p1Value
            : stat.p2Value < stat.p1Value;
          const equal = stat.p1Value === stat.p2Value;

          return (
            <li key={stat.label} className="py-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                {/* P1 value */}
                <span
                  className={`stat-inline text-sm ${
                    p1Better ? "font-bold" : equal ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                  }`}
                  style={p1Better ? { color: PLAYER_COLORS.p1 } : undefined}
                >
                  {stat.format(stat.p1Value)}
                  {p1Better && <span className="sr-only">(lepszy)</span>}
                </span>

                {/* Label */}
                <span className="max-w-[9.5rem] text-center text-xs font-medium leading-tight text-[var(--text-secondary)] sm:max-w-none">
                  {stat.label}
                  {!stat.higherIsBetter && (
                    <span className="block text-[11px] text-[var(--text-tertiary)]">mniej = lepiej</span>
                  )}
                </span>

                {/* P2 value */}
                <span
                  className={`stat-inline text-right text-sm ${
                    p2Better ? "font-bold" : equal ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                  }`}
                  style={p2Better ? { color: PLAYER_COLORS.p2 } : undefined}
                >
                  {stat.format(stat.p2Value)}
                  {p2Better && <span className="sr-only">(lepszy)</span>}
                </span>
              </div>

              {/* Mirrored bars growing out from the middle */}
              <div className="mt-1.5 grid grid-cols-2 gap-1" aria-hidden>
                <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-[var(--surface-3)]">
                  <div
                    className="h-full rounded-l-full transition-all duration-300"
                    style={{
                      width: `${p1Pct}%`,
                      backgroundColor: PLAYER_COLORS.p1,
                      opacity: p1Better || equal ? 0.9 : 0.35,
                    }}
                  />
                </div>
                <div className="flex h-1.5 overflow-hidden rounded-r-full bg-[var(--surface-3)]">
                  <div
                    className="h-full rounded-r-full transition-all duration-300"
                    style={{
                      width: `${p2Pct}%`,
                      backgroundColor: PLAYER_COLORS.p2,
                      opacity: p2Better || equal ? 0.9 : 0.35,
                    }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
