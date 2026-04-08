import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RoundTimeline } from "./round-timeline";
import { mapDisplayName } from "@/lib/utils/mapNames";

interface Props {
  params: Promise<{ matchId: string }>;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default async function MatchDetailPage({ params }: Props) {
  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      players: { orderBy: { hltvRating: "desc" } },
      rounds: {
        orderBy: { number: "asc" },
        include: {
          kills: { orderBy: { tick: "asc" } },
        },
      },
    },
  });

  if (!match) notFound();

  const ctPlayers = match.players.filter((p) => p.team === "CT");
  const tPlayers = match.players.filter((p) => p.team === "T");
  const ctWon = match.scoreCT > match.scoreT;

  // Serialize rounds + kills for client component
  const roundsData = match.rounds.map((r) => ({
    number: r.number,
    winner: r.winner as "CT" | "T",
    winReason: r.winReason,
    kills: r.kills.map((k) => ({
      attackerName: k.attackerName,
      victimName: k.victimName,
      weapon: k.weapon,
      headshot: k.headshot,
      wallbang: k.wallbang,
      throughSmoke: k.throughSmoke,
      noScope: k.noScope,
      isFirstKill: k.isFirstKill,
    })),
  }));

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/matches"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to matches
      </Link>

      {/* Match header */}
      <Card className="p-6">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {mapDisplayName(match.map)}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {match.date.toLocaleDateString()}
              {match.duration > 0 && ` — ${formatDuration(match.duration)}`}
              {match.server && ` — ${match.server}`}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-medium uppercase text-[var(--ct-blue)]">CT</p>
              <p className={`stat-number ${ctWon ? "text-[var(--ct-blue)]" : "text-[var(--text-tertiary)]"}`}>
                {match.scoreCT}
              </p>
            </div>
            <span className="text-lg text-[var(--text-disabled)]">:</span>
            <div>
              <p className="text-xs font-medium uppercase text-[var(--t-gold)]">T</p>
              <p className={`stat-number ${!ctWon ? "text-[var(--t-gold)]" : "text-[var(--text-tertiary)]"}`}>
                {match.scoreT}
              </p>
            </div>
          </div>
        </div>

        {/* Interactive round timeline */}
        {roundsData.length > 0 && <RoundTimeline rounds={roundsData} />}
      </Card>

      {/* CT Scoreboard */}
      <ScoreboardTable
        title="Counter-Terrorists"
        teamColor="ct"
        players={ctPlayers}
      />

      {/* T Scoreboard */}
      <ScoreboardTable
        title="Terrorists"
        teamColor="t"
        players={tPlayers}
      />
    </div>
  );
}

function ScoreboardTable({
  title,
  teamColor,
  players,
}: {
  title: string;
  teamColor: "ct" | "t";
  players: {
    name: string;
    kills: number;
    deaths: number;
    assists: number;
    adr: number;
    hltvRating: number;
    hsPercent: number;
    firstKills: number;
    firstDeaths: number;
  }[];
}) {
  const borderColor = teamColor === "ct" ? "var(--ct-blue)" : "var(--t-gold)";
  const badgeVariant = teamColor === "ct" ? "ct" : "t";

  return (
    <Card className="overflow-hidden p-0" style={{ borderTopColor: borderColor, borderTopWidth: 2 }}>
      <div className="px-5 py-3">
        <Badge variant={badgeVariant as "ct" | "t"}>{title}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
              <th className="px-5 py-2.5">Player</th>
              <th className="px-3 py-2.5 text-center">K</th>
              <th className="px-3 py-2.5 text-center">D</th>
              <th className="px-3 py-2.5 text-center">A</th>
              <th className="px-3 py-2.5 text-center">+/-</th>
              <th className="px-3 py-2.5 text-center">ADR</th>
              <th className="px-3 py-2.5 text-center">HLTV</th>
              <th className="px-3 py-2.5 text-center">HS%</th>
              <th className="px-3 py-2.5 text-center">FK</th>
              <th className="px-3 py-2.5 text-center">FD</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr
                key={p.name}
                className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.02)]"
              >
                <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                  {p.name}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                  {p.kills}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.deaths}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.assists}
                </td>
                <td className={`stat-inline px-3 py-3 text-center ${
                  p.kills - p.deaths > 0
                    ? "text-[var(--success)]"
                    : p.kills - p.deaths < 0
                      ? "text-[var(--error)]"
                      : "text-[var(--text-secondary)]"
                }`}>
                  {p.kills - p.deaths > 0 ? "+" : ""}{p.kills - p.deaths}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                  {p.adr.toFixed(1)}
                </td>
                <td className={`stat-inline px-3 py-3 text-center font-semibold ${
                  p.hltvRating >= 1.2
                    ? "text-[var(--success)]"
                    : p.hltvRating >= 0.8
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--error)]"
                }`}>
                  {p.hltvRating.toFixed(2)}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.hsPercent.toFixed(0)}%
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.firstKills}
                </td>
                <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                  {p.firstDeaths}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
