import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, StatCard, Badge } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ steamId: string }>;
}

export default async function PlayerDetailPage({ params }: Props) {
  const { steamId } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Get all match entries for this player from user's demos
  const matchEntries = userId
    ? await prisma.matchPlayer.findMany({
        where: {
          steamId,
          match: { upload: { userId } },
        },
        include: {
          match: {
            select: {
              id: true,
              map: true,
              date: true,
              scoreCT: true,
              scoreT: true,
            },
          },
        },
        orderBy: { match: { date: "desc" } },
      })
    : [];

  if (matchEntries.length === 0) notFound();

  const playerName = matchEntries[0].name;

  // Aggregate stats
  const totalMatches = matchEntries.length;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  let totalAdr = 0;
  let totalHltv = 0;
  let totalHs = 0;
  let wins = 0;

  for (const entry of matchEntries) {
    totalKills += entry.kills;
    totalDeaths += entry.deaths;
    totalAssists += entry.assists;
    totalAdr += entry.adr;
    totalHltv += entry.hltvRating;
    totalHs += entry.hsPercent;

    const teamScore = entry.team === "CT" ? entry.match.scoreCT : entry.match.scoreT;
    const enemyScore = entry.team === "CT" ? entry.match.scoreT : entry.match.scoreCT;
    if (teamScore > enemyScore) wins++;
  }

  const avgKd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills;
  const avgAdr = totalAdr / totalMatches;
  const avgHltv = totalHltv / totalMatches;
  const avgHs = totalHs / totalMatches;
  const winRate = Math.round((wins / totalMatches) * 100);

  return (
    <div className="space-y-6">
      <Link
        href="/players"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to players
      </Link>

      {/* Player header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {playerName}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {totalMatches} match{totalMatches !== 1 ? "es" : ""} analyzed
        </p>
      </div>

      {/* Stat overview */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="K/D Ratio" value={avgKd.toFixed(2)} />
        <StatCard label="Avg ADR" value={avgAdr.toFixed(1)} accentColor="var(--ct-blue)" />
        <StatCard label="Avg HLTV" value={avgHltv.toFixed(2)} accentColor="var(--t-gold)" />
        <StatCard label="HS%" value={`${avgHs.toFixed(0)}%`} />
        <StatCard
          label="Win Rate"
          value={`${winRate}%`}
          accentColor="var(--success)"
        />
      </div>

      {/* Match history */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
          Match History
        </h2>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                  <th className="px-5 py-3">Map</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3 text-center">Result</th>
                  <th className="px-3 py-3 text-center">Score</th>
                  <th className="px-3 py-3 text-center">K</th>
                  <th className="px-3 py-3 text-center">D</th>
                  <th className="px-3 py-3 text-center">A</th>
                  <th className="px-3 py-3 text-center">ADR</th>
                  <th className="px-3 py-3 text-center">HLTV</th>
                </tr>
              </thead>
              <tbody>
                {matchEntries.map((entry) => {
                  const teamScore = entry.team === "CT" ? entry.match.scoreCT : entry.match.scoreT;
                  const enemyScore = entry.team === "CT" ? entry.match.scoreT : entry.match.scoreCT;
                  const won = teamScore > enemyScore;
                  const draw = teamScore === enemyScore;

                  return (
                    <tr
                      key={entry.id}
                      className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-8 w-8 flex-shrink-0 rounded bg-[var(--surface-3)] bg-cover bg-center"
                            style={{
                              backgroundImage: `url(/maps/${entry.match.map}_radar.png)`,
                              filter: "grayscale(40%) brightness(0.7)",
                            }}
                          />
                          <Link
                            href={`/matches/${entry.match.id}`}
                            className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                          >
                            {mapDisplayName(entry.match.map)}
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-tertiary)]">
                        {entry.match.date.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant={won ? "success" : draw ? "neutral" : "error"}>
                          {won ? "W" : draw ? "D" : "L"}
                        </Badge>
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                        {teamScore}:{enemyScore}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                        {entry.kills}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                        {entry.deaths}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                        {entry.assists}
                      </td>
                      <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                        {entry.adr.toFixed(1)}
                      </td>
                      <td className={`stat-inline px-3 py-3 text-center font-semibold ${
                        entry.hltvRating >= 1.2
                          ? "text-[var(--success)]"
                          : entry.hltvRating >= 0.8
                            ? "text-[var(--text-primary)]"
                            : "text-[var(--error)]"
                      }`}>
                        {entry.hltvRating.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
