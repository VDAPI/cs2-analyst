import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

export interface ScoreboardPlayer {
  steamId: string;
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hltvRating: number;
  hsPercent: number;
  firstKills: number;
  firstDeaths: number;
  wallbangs: number;
  smokeKills: number;
}

const COLUMNS: { key: string; label: string; title: string }[] = [
  { key: "k", label: "K", title: "Zabójstwa" },
  { key: "d", label: "D", title: "Śmierci" },
  { key: "a", label: "A", title: "Asysty" },
  { key: "diff", label: "+/-", title: "Różnica zabójstw i śmierci" },
  { key: "adr", label: "ADR", title: "Średnie obrażenia na rundę" },
  { key: "hltv", label: "HLTV", title: "Rating HLTV" },
  { key: "hs", label: "HS%", title: "Procent zabójstw w głowę" },
  { key: "wb", label: "WB", title: "Zabójstwa przez ścianę (wallbang)" },
  { key: "sk", label: "SK", title: "Zabójstwa przez smoke" },
  { key: "fk", label: "FK", title: "Pierwsze zabójstwa w rundzie" },
  { key: "fd", label: "FD", title: "Pierwsze śmierci w rundzie" },
];

/** Per-team scoreboard. The match-best rating is marked lime. */
export function ScoreboardTable({
  title,
  team,
  score,
  players,
  bestSteamId,
}: {
  title: string;
  team: "CT" | "T";
  score: number;
  players: ScoreboardPlayer[];
  bestSteamId: string | null;
}) {
  const teamColor = team === "CT" ? "var(--ct-blue)" : "var(--t-gold)";

  return (
    <Card className="overflow-hidden p-0 md:p-0" style={{ borderTopColor: teamColor, borderTopWidth: 2 }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant={team === "CT" ? "ct" : "t"}>{team}</Badge>
          <h2 className="truncate font-display text-base font-semibold text-[var(--text-primary)]">
            {title}
          </h2>
        </div>
        <span className="stat-small" style={{ color: teamColor }}>
          {score}
        </span>
      </div>
      <div className="table-scroll border-t border-[var(--border)]">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Gracz</th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col">
                  <abbr title={c.title} className="no-underline">
                    {c.label}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const diff = p.kills - p.deaths;
              const isBest = p.steamId === bestSteamId;
              return (
                <tr key={p.steamId}>
                  <td>
                    <Link
                      href={`/players/${p.steamId}`}
                      className="font-medium text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
                      title={p.name}
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td>
                    <span className="text-[var(--text-primary)]">{p.kills}</span>
                  </td>
                  <td>{p.deaths}</td>
                  <td>{p.assists}</td>
                  <td>
                    <span
                      className={cn(diff > 0 && "text-[var(--good)]", diff < 0 && "text-[var(--mistake)]")}
                    >
                      {diff > 0 ? "+" : ""}
                      {diff}
                    </span>
                  </td>
                  <td>
                    <span className="text-[var(--text-primary)]">{p.adr.toFixed(1)}</span>
                  </td>
                  <td>
                    <span
                      className={cn(
                        "font-semibold",
                        isBest
                          ? "text-[var(--accent-2)]"
                          : p.hltvRating >= 1.2
                            ? "text-[var(--good)]"
                            : p.hltvRating >= 0.8
                              ? "text-[var(--text-primary)]"
                              : "text-[var(--mistake)]",
                      )}
                      title={isBest ? "Najlepszy rating w meczu" : undefined}
                    >
                      {p.hltvRating.toFixed(2)}
                    </span>
                  </td>
                  <td>{p.hsPercent.toFixed(0)}%</td>
                  <td>{p.wallbangs}</td>
                  <td>{p.smokeKills}</td>
                  <td>{p.firstKills}</td>
                  <td>{p.firstDeaths}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Legend for the short column names — readable on touch, where `title` tooltips don't open. */
export function ScoreboardLegend() {
  return (
    <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
      <span className="font-mono text-[var(--text-secondary)]">WB</span> — zabójstwa przez ścianę ·{" "}
      <span className="font-mono text-[var(--text-secondary)]">SK</span> — zabójstwa przez smoke ·{" "}
      <span className="font-mono text-[var(--text-secondary)]">FK / FD</span> — pierwsze zabójstwa / pierwsze
      śmierci w rundzie · <span className="font-mono text-[var(--text-secondary)]">HLTV</span> — rating;{" "}
      <span className="text-[var(--accent-2)]">limonkowy</span> = najlepszy w meczu
    </p>
  );
}
