import Link from "next/link";
import { Card } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { spotVerdict, type SpotStat } from "@/lib/team/spot-stats";

/** Per map: positions with kills / deaths, the bad ones (more deaths than kills) and the good ones marked. */
export function SpotsTable({ rows }: { rows: SpotStat[] }) {
  const maps = [...new Set(rows.map((r) => r.map))];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {maps.map((map) => {
        const list = rows.filter((r) => r.map === map && r.place !== "?").slice(0, 14);
        return (
          <Card key={map} className="space-y-2 p-0 md:p-0">
            <div className="flex items-center justify-between px-4 pt-3">
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">{mapDisplayName(map)}</h3>
              <Link href={`/callouts?map=${map}`} className="text-xs text-[var(--accent-hover)] hover:underline">
                Mapa pozycji
              </Link>
            </div>
            <div className="table-scroll">
              <table className="data-table text-sm">
                <thead>
                  <tr>
                    <th>Pozycja</th>
                    <th>Strona</th>
                    <th>Zabójstwa</th>
                    <th>Śmierci</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => {
                    const verdict = spotVerdict(r);
                    return (
                      <tr key={`${r.side}|${r.place}`}>
                        <td
                          className={cn(
                            "font-medium",
                            verdict === "bad" && "text-[var(--mistake)]",
                            verdict === "good" && "text-[var(--good)]"
                          )}
                          title={verdict === "bad" ? "Tu częściej giniesz, niż zabijasz" : verdict === "good" ? "Ta pozycja działa" : undefined}
                        >
                          {r.place}
                        </td>
                        <td className={r.side === "CT" ? "text-[var(--ct-blue)]" : r.side === "T" ? "text-[var(--t-gold)]" : ""}>{r.side}</td>
                        <td className="font-mono">{r.kills}</td>
                        <td className="font-mono">{r.deaths}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
