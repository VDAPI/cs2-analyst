import { Card, SectionTitle } from "@/components/ui";
import { MapThumb } from "@/components/match";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { PLAYER_COLORS, matchesLabel } from "../../../compare-ui";

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

type Slot = "p1" | "p2";
type Metric = "kd" | "avgAdr" | "avgHltv";

const METRICS: Array<{ key: Metric; label: string; format: (v: number) => string }> = [
  { key: "kd", label: "K/D", format: (v) => v.toFixed(2) },
  { key: "avgAdr", label: "ADR", format: (v) => v.toFixed(1) },
  { key: "avgHltv", label: "HLTV", format: (v) => v.toFixed(2) },
];

/** Value cell: highlighted in the player's color when it beats the other player on this map. */
function MetricValue({
  self,
  other,
  metric,
  slot,
  format,
  className,
}: {
  self: MapStat | undefined;
  other: MapStat | undefined;
  metric: Metric;
  slot: Slot;
  format: (v: number) => string;
  className?: string;
}) {
  if (!self) return <span className={`text-[var(--text-disabled)] ${className ?? ""}`}>—</span>;
  const wins = other !== undefined && self[metric] > other[metric];
  return (
    <span
      className={`font-mono tabular-nums ${wins ? "font-bold" : "text-[var(--text-primary)]"} ${className ?? ""}`}
      style={wins ? { color: PLAYER_COLORS[slot] } : undefined}
    >
      {format(self[metric])}
    </span>
  );
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
    <Card>
      <SectionTitle>Wyniki na mapach</SectionTitle>

      {/* Phones: one card per map */}
      <ul className="space-y-3 md:hidden">
        {allMaps.map((map) => {
          const p1 = player1Maps[map];
          const p2 = player2Maps[map];
          return (
            <li key={map} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="mb-2 flex items-center gap-3">
                <MapThumb map={map} size="sm" />
                <p className="min-w-0 truncate font-display font-semibold text-[var(--text-primary)]">
                  {mapDisplayName(map)}
                </p>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                <span className="truncate text-xs font-semibold" style={{ color: PLAYER_COLORS.p1 }}>
                  {player1Name}
                </span>
                <span />
                <span className="truncate text-right text-xs font-semibold" style={{ color: PLAYER_COLORS.p2 }}>
                  {player2Name}
                </span>

                <span className="stat-inline text-[var(--text-secondary)]">
                  {p1 ? matchesLabel(p1.matches) : "—"}
                </span>
                <span className="label-overline self-center text-center text-[var(--text-tertiary)]">Mecze</span>
                <span className="stat-inline text-right text-[var(--text-secondary)]">
                  {p2 ? matchesLabel(p2.matches) : "—"}
                </span>

                {METRICS.map((m) => (
                  <MetricRow key={m.key} label={m.label}>
                    <MetricValue self={p1} other={p2} metric={m.key} slot="p1" format={m.format} />
                    <MetricValue
                      self={p2}
                      other={p1}
                      metric={m.key}
                      slot="p2"
                      format={m.format}
                      className="text-right"
                    />
                  </MetricRow>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Tablet / desktop: table */}
      <div className="table-scroll hidden md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>Mapa</th>
              <th colSpan={4} className="max-w-[12rem] truncate" style={{ color: PLAYER_COLORS.p1 }}>
                {player1Name}
              </th>
              <th colSpan={4} className="max-w-[12rem] truncate" style={{ color: PLAYER_COLORS.p2 }}>
                {player2Name}
              </th>
            </tr>
            <tr>
              <th aria-hidden />
              <th title="Mecze">M</th>
              {METRICS.map((m) => (
                <th key={`p1-${m.key}`}>{m.label}</th>
              ))}
              <th title="Mecze">M</th>
              {METRICS.map((m) => (
                <th key={`p2-${m.key}`}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allMaps.map((map) => {
              const p1 = player1Maps[map];
              const p2 = player2Maps[map];
              return (
                <tr key={map}>
                  <td className="font-medium text-[var(--text-primary)]">
                    <span className="flex items-center gap-2.5">
                      <MapThumb map={map} size="sm" />
                      {mapDisplayName(map)}
                    </span>
                  </td>
                  <td>{p1?.matches ?? "—"}</td>
                  {METRICS.map((m) => (
                    <td key={`p1-${m.key}`}>
                      <MetricValue self={p1} other={p2} metric={m.key} slot="p1" format={m.format} />
                    </td>
                  ))}
                  <td>{p2?.matches ?? "—"}</td>
                  {METRICS.map((m) => (
                    <td key={`p2-${m.key}`}>
                      <MetricValue self={p2} other={p1} metric={m.key} slot="p2" format={m.format} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MetricRow({ label, children }: { label: string; children: [React.ReactNode, React.ReactNode] }) {
  return (
    <>
      {children[0]}
      <span className="label-overline self-center text-center text-[var(--text-tertiary)]">{label}</span>
      {children[1]}
    </>
  );
}
