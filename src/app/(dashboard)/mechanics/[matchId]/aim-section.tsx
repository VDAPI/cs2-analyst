import Link from "next/link";
import { Play } from "lucide-react";
import { Card, FindingTag } from "@/components/ui";
import {
  aimMetrics,
  PEEK_TYPES,
  type AimMetric,
  type AimMoment,
  type AimMomentType,
  type MetricStatus,
  type PeekTally,
  type PeekType,
  type PlayerAim,
} from "@/lib/analysis/aim";
import { cn } from "@/lib/utils/cn";

export type AimRow = Omit<PlayerAim, "moments" | "peekTypes"> & {
  moments: AimMoment[];
  peekTypes: Record<PeekType, PeekTally>;
};

const MOMENT_LABEL: Record<AimMomentType, string> = {
  crosshair: "Crosshair",
  reaction: "Reakcja",
  spray: "Spray",
  overflick: "Overflick",
  dry_peek: "Suchy peek",
  noise: "Bieg przy wrogu",
  jump: "Skok",
  air_shot: "Strzał w powietrzu",
  reload: "Reload",
};

const PEEK_LABEL: Record<PeekType, { name: string; hint: string }> = {
  wide: { name: "Szeroki", hint: "wyjście daleko w bok, wróg widzi cię od razu całego" },
  tight: { name: "Ciasny", hint: "wyjście blisko ściany, bez dużego przesunięcia" },
  jiggle: { name: "Jiggle", hint: "wyjście i powrót bez strzału, zbieranie info" },
  shoulder: { name: "Shoulder", hint: "pokazanie barku, żeby wróg oddał strzał (np. AWP)" },
};

const STATUS_TONE: Record<MetricStatus, string> = {
  good: "text-[var(--good)]",
  warn: "text-[var(--warning)]",
  bad: "text-[var(--mistake)]",
  none: "text-[var(--text-tertiary)]",
};

/** Moment's main number, by type. */
function momentValue(m: AimMoment): string {
  switch (m.type) {
    case "crosshair":
    case "overflick":
      return `${m.value}°`;
    case "reaction":
      return `${m.value} ms`;
    case "spray":
      return `${m.value} kul`;
    case "dry_peek":
      return `${m.value} u/s`;
    case "noise":
      return `${m.value.toFixed(1)} s`;
    case "jump":
      return `${m.value} u`;
    case "air_shot":
      return `${m.value} u/s`;
    case "reload":
      return m.value >= 0 ? `${m.value} kul` : "";
  }
}

function fmtRoundTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtMetric(m: AimMetric): string {
  if (m.value == null) return "–";
  return m.unit === "" ? String(m.value) : `${m.value}${m.unit === "°" || m.unit === "%" ? "" : " "}${m.unit}`;
}

export function AimSection({
  matchId,
  steamId,
  aim,
  filter,
}: {
  matchId: string;
  steamId: string;
  aim: AimRow;
  filter: AimMomentType | null;
}) {
  const metrics = aimMetrics(aim);
  const counts = new Map<AimMomentType, number>();
  for (const m of aim.moments) counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  const shown = filter ? aim.moments.filter((m) => m.type === filter) : aim.moments;
  const filterHref = (t: AimMomentType | null) =>
    `/mechanics/${matchId}?player=${steamId}${t ? `&aim=${t}` : ""}#celowanie`;

  return (
    <section id="celowanie" className="scroll-mt-20 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Celowanie i pojedynki</h2>
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
          {aim.visibility === "fov"
            ? "Widoczność przybliżona polem widzenia (mecz bez danych o widoczności), czas reakcji niedostępny."
            : aim.visibility === "mixed"
              ? "Widoczność z gry tam, gdzie jest zapisana, w pozostałych rundach przybliżona polem widzenia."
              : "Widoczność z gry (linia wzroku), więc ściany i smoke'i się liczą."}
          {" "}
          <span className="font-mono">{aim.duels}</span> pojedynków, w{" "}
          <span className="font-mono">{aim.duelsUnseen}</span> wróg trafił cię pierwszy, zanim go widziałeś.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => {
          const linked = m.moments && (counts.get(m.moments) ?? 0) > 0 ? m.moments : null;
          return (
            <Card key={m.key} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-[var(--text-tertiary)]">{m.label}</p>
                {m.status === "bad" && <FindingTag severity="high">Źle</FindingTag>}
                {m.status === "warn" && <FindingTag severity="medium">Średnio</FindingTag>}
                {m.status === "good" && <FindingTag severity="good">Dobrze</FindingTag>}
              </div>
              <p className={cn("mt-1 font-mono text-2xl font-semibold", STATUS_TONE[m.status])}>{fmtMetric(m)}</p>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                Próg: <span className="font-mono">{m.threshold}</span>
                <span className="text-[var(--text-tertiary)]"> · próbka </span>
                <span className="font-mono">{m.samples}</span>
              </p>
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">{m.hint}</p>
              {linked && (
                <Link
                  href={filterHref(linked)}
                  scroll={false}
                  className="mt-2 text-xs font-medium text-[var(--accent-hover)] hover:underline"
                >
                  Momenty: <span className="font-mono">{counts.get(linked)}</span>
                </Link>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Rodzaje peeków</h3>
          <p className="text-xs text-[var(--text-tertiary)]">
            Gdy wyszedłeś na wroga w ruchu. Suchych peeków (bez flasha): <span className="font-mono">{aim.dryPeeks}</span>,
            przegranych: <span className="font-mono">{aim.dryPeeksLost}</span>.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-t border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                <th className="px-4 py-2.5 sm:px-5">Peek</th>
                <th className="px-3 py-2.5 text-center">Ile</th>
                <th className="px-3 py-2.5 text-center">Wygrane</th>
                <th className="px-3 py-2.5 text-center">Przegrane</th>
              </tr>
            </thead>
            <tbody>
              {PEEK_TYPES.map((t) => {
                const row = aim.peekTypes[t];
                return (
                  <tr key={t} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2.5 sm:px-5">
                      <p className="font-medium text-[var(--text-primary)]">{PEEK_LABEL[t].name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{PEEK_LABEL[t].hint}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--text-secondary)]">{row.count}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--good)]">{row.won}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-[var(--mistake)]">{row.lost}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
          Momenty <span className="font-mono text-[var(--text-tertiary)]">({shown.length})</span>
        </h3>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip href={filterHref(null)} active={filter === null} label="Wszystkie" count={aim.moments.length} />
          {(Object.keys(MOMENT_LABEL) as AimMomentType[])
            .filter((t) => counts.has(t))
            .map((t) => (
              <FilterChip key={t} href={filterHref(t)} active={filter === t} label={MOMENT_LABEL[t]} count={counts.get(t)!} />
            ))}
        </div>
        {shown.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--text-secondary)]">Brak momentów w tej kategorii.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((m) => (
              <Link
                key={`${m.type}-${m.roundNumber}-${m.tick}`}
                href={`/replay/${matchId}?round=${m.roundNumber}&tick=${m.tick}&player=${steamId}`}
                className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--border-hover)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    <span className="font-mono">R{m.roundNumber}</span>
                    <span className="mx-1.5 text-[var(--text-disabled)]">·</span>
                    <span className="font-mono">{fmtRoundTime(m.roundTime)}</span>
                    <span className="mx-1.5 text-[var(--text-disabled)]">·</span>
                    {MOMENT_LABEL[m.type]}
                    {momentValue(m) && (
                      <span className={cn("ml-1.5 font-mono", m.costly ? "text-[var(--mistake)]" : "text-[var(--warning)]")}>
                        {momentValue(m)}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{m.detail}</p>
                </div>
                <Play className="h-4 w-4 flex-shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)]" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
          : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
      )}
    >
      {label}
      <span className="font-mono text-[var(--text-tertiary)]">{count}</span>
    </Link>
  );
}
