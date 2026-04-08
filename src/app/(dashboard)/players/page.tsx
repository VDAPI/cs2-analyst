import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card } from "@/components/ui";
import Link from "next/link";

export default async function PlayersPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Get all match players from user's matches
  const matchPlayers = userId
    ? await prisma.matchPlayer.findMany({
        where: { match: { upload: { userId } } },
        select: {
          steamId: true,
          name: true,
          team: true,
          kills: true,
          deaths: true,
          assists: true,
          adr: true,
          hltvRating: true,
          hsPercent: true,
          firstKills: true,
          firstDeaths: true,
        },
      })
    : [];

  // Aggregate by steamId
  const playerMap = new Map<
    string,
    {
      steamId: string;
      name: string;
      matches: number;
      totalKills: number;
      totalDeaths: number;
      totalAssists: number;
      totalAdr: number;
      totalHltv: number;
      totalHs: number;
      totalFk: number;
      totalFd: number;
    }
  >();

  for (const p of matchPlayers) {
    const existing = playerMap.get(p.steamId);
    if (existing) {
      existing.matches++;
      existing.name = p.name; // use latest name
      existing.totalKills += p.kills;
      existing.totalDeaths += p.deaths;
      existing.totalAssists += p.assists;
      existing.totalAdr += p.adr;
      existing.totalHltv += p.hltvRating;
      existing.totalHs += p.hsPercent;
      existing.totalFk += p.firstKills;
      existing.totalFd += p.firstDeaths;
    } else {
      playerMap.set(p.steamId, {
        steamId: p.steamId,
        name: p.name,
        matches: 1,
        totalKills: p.kills,
        totalDeaths: p.deaths,
        totalAssists: p.assists,
        totalAdr: p.adr,
        totalHltv: p.hltvRating,
        totalHs: p.hsPercent,
        totalFk: p.firstKills,
        totalFd: p.firstDeaths,
      });
    }
  }

  // Sort by avg HLTV descending
  const players = Array.from(playerMap.values())
    .map((p) => ({
      steamId: p.steamId,
      name: p.name,
      matches: p.matches,
      avgKills: p.totalKills / p.matches,
      avgDeaths: p.totalDeaths / p.matches,
      kd: p.totalDeaths > 0 ? p.totalKills / p.totalDeaths : p.totalKills,
      avgAdr: p.totalAdr / p.matches,
      avgHltv: p.totalHltv / p.matches,
      avgHs: p.totalHs / p.matches,
      totalFk: p.totalFk,
      totalFd: p.totalFd,
    }))
    .sort((a, b) => b.avgHltv - a.avgHltv);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Players
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          All players from your analyzed demos with aggregate stats.
        </p>
      </div>

      {players.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-[var(--text-secondary)]">
              No player data yet
            </p>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              Upload demos to see player statistics here.
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-5 text-sm font-medium text-white transition-all hover:bg-[var(--accent-hover)]"
            >
              Upload Demo
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase text-[var(--text-tertiary)]">
                  <th className="px-5 py-3">Player</th>
                  <th className="px-3 py-3 text-center">Matches</th>
                  <th className="px-3 py-3 text-center">K/D</th>
                  <th className="px-3 py-3 text-center">Avg K</th>
                  <th className="px-3 py-3 text-center">Avg D</th>
                  <th className="px-3 py-3 text-center">ADR</th>
                  <th className="px-3 py-3 text-center">HLTV</th>
                  <th className="px-3 py-3 text-center">HS%</th>
                  <th className="px-3 py-3 text-center">FK</th>
                  <th className="px-3 py-3 text-center">FD</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr
                    key={p.steamId}
                    className="border-t border-[var(--border)] transition-colors hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/players/${p.steamId}`}
                        className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                      {p.matches}
                    </td>
                    <td className={`stat-inline px-3 py-3 text-center font-semibold ${
                      p.kd >= 1.2
                        ? "text-[var(--success)]"
                        : p.kd >= 0.8
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--error)]"
                    }`}>
                      {p.kd.toFixed(2)}
                    </td>
                    <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                      {p.avgKills.toFixed(1)}
                    </td>
                    <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                      {p.avgDeaths.toFixed(1)}
                    </td>
                    <td className="stat-inline px-3 py-3 text-center text-[var(--text-primary)]">
                      {p.avgAdr.toFixed(1)}
                    </td>
                    <td className={`stat-inline px-3 py-3 text-center font-semibold ${
                      p.avgHltv >= 1.2
                        ? "text-[var(--success)]"
                        : p.avgHltv >= 0.8
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--error)]"
                    }`}>
                      {p.avgHltv.toFixed(2)}
                    </td>
                    <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                      {p.avgHs.toFixed(0)}%
                    </td>
                    <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                      {p.totalFk}
                    </td>
                    <td className="stat-inline px-3 py-3 text-center text-[var(--text-secondary)]">
                      {p.totalFd}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
