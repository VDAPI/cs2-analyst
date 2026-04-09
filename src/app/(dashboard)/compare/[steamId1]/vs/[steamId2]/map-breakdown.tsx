import { Card } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";

interface MapStat {
  matches: number;
  kd: number;
  avgAdr: number;
  avgHltv: number;
}

interface MapBreakdownProps {
  player1Name: string;
  player2Name: string;
  player1Maps: Record<string, MapStat>;
  player2Maps: Record<string, MapStat>;
}

export function MapBreakdown({
  player1Name,
  player2Name,
  player1Maps,
  player2Maps,
}: MapBreakdownProps) {
  const allMaps = [
    ...new Set([...Object.keys(player1Maps), ...Object.keys(player2Maps)]),
  ].sort();

  if (allMaps.length === 0) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="p-5 pb-0">
        <h2 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">
          Map Performance
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs font-medium uppercase text-[var(--text-tertiary)]">
              <th className="px-5 py-3 text-left">Map</th>
              <th
                className="px-3 py-3 text-center"
                colSpan={4}
                style={{ color: "var(--ct-blue)" }}
              >
                {player1Name}
              </th>
              <th
                className="px-3 py-3 text-center"
                colSpan={4}
                style={{ color: "var(--t-gold)" }}
              >
                {player2Name}
              </th>
            </tr>
            <tr className="border-b border-[var(--border)] text-xs font-medium uppercase text-[var(--text-tertiary)]">
              <th className="px-5 py-2" />
              <th className="px-3 py-2 text-center">M</th>
              <th className="px-3 py-2 text-center">K/D</th>
              <th className="px-3 py-2 text-center">ADR</th>
              <th className="px-3 py-2 text-center">HLTV</th>
              <th className="px-3 py-2 text-center">M</th>
              <th className="px-3 py-2 text-center">K/D</th>
              <th className="px-3 py-2 text-center">ADR</th>
              <th className="px-3 py-2 text-center">HLTV</th>
            </tr>
          </thead>
          <tbody>
            {allMaps.map((map) => {
              const p1 = player1Maps[map];
              const p2 = player2Maps[map];

              return (
                <tr
                  key={map}
                  className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                >
                  <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                    {mapDisplayName(map)}
                  </td>
                  {/* P1 stats */}
                  <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                    {p1?.matches ?? "—"}
                  </td>
                  <td
                    className={`stat-inline px-3 py-3 text-center font-semibold ${
                      p1 && p2
                        ? p1.kd > p2.kd
                          ? "text-[var(--success)]"
                          : "text-[var(--text-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {p1 ? p1.kd.toFixed(2) : "—"}
                  </td>
                  <td
                    className={`stat-inline px-3 py-3 text-center ${
                      p1 && p2
                        ? p1.avgAdr > p2.avgAdr
                          ? "text-[var(--success)]"
                          : "text-[var(--text-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {p1 ? p1.avgAdr.toFixed(1) : "—"}
                  </td>
                  <td
                    className={`stat-inline px-3 py-3 text-center font-semibold ${
                      p1 && p2
                        ? p1.avgHltv > p2.avgHltv
                          ? "text-[var(--success)]"
                          : "text-[var(--text-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {p1 ? p1.avgHltv.toFixed(2) : "—"}
                  </td>
                  {/* P2 stats */}
                  <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                    {p2?.matches ?? "—"}
                  </td>
                  <td
                    className={`stat-inline px-3 py-3 text-center font-semibold ${
                      p1 && p2
                        ? p2.kd > p1.kd
                          ? "text-[var(--success)]"
                          : "text-[var(--text-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {p2 ? p2.kd.toFixed(2) : "—"}
                  </td>
                  <td
                    className={`stat-inline px-3 py-3 text-center ${
                      p1 && p2
                        ? p2.avgAdr > p1.avgAdr
                          ? "text-[var(--success)]"
                          : "text-[var(--text-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {p2 ? p2.avgAdr.toFixed(1) : "—"}
                  </td>
                  <td
                    className={`stat-inline px-3 py-3 text-center font-semibold ${
                      p1 && p2
                        ? p2.avgHltv > p1.avgHltv
                          ? "text-[var(--success)]"
                          : "text-[var(--text-primary)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {p2 ? p2.avgHltv.toFixed(2) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
