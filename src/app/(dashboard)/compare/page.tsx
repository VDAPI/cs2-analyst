import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PlayerSelector } from "./player-selector";
import type { PlayerSummary } from "./types";

export default async function ComparePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const matchPlayers = userId
    ? await prisma.matchPlayer.findMany({
        where: { match: { upload: { userId } } },
        select: {
          steamId: true,
          name: true,
          kills: true,
          deaths: true,
          hltvRating: true,
        },
      })
    : [];

  // Aggregate by steamId
  const playerMap = new Map<string, PlayerSummary & { totalKills: number; totalDeaths: number; totalHltv: number }>();

  for (const p of matchPlayers) {
    const existing = playerMap.get(p.steamId);
    if (existing) {
      existing.matchCount++;
      existing.name = p.name;
      existing.totalKills += p.kills;
      existing.totalDeaths += p.deaths;
      existing.totalHltv += p.hltvRating;
    } else {
      playerMap.set(p.steamId, {
        steamId: p.steamId,
        name: p.name,
        matchCount: 1,
        avgKd: 0,
        avgHltv: 0,
        totalKills: p.kills,
        totalDeaths: p.deaths,
        totalHltv: p.hltvRating,
      });
    }
  }

  const players = Array.from(playerMap.values())
    .map((p) => ({
      steamId: p.steamId,
      name: p.name,
      matchCount: p.matchCount,
      avgKd: p.totalDeaths > 0 ? p.totalKills / p.totalDeaths : p.totalKills,
      avgHltv: p.totalHltv / p.matchCount,
    }))
    .sort((a, b) => b.matchCount - a.matchCount);

  return <PlayerSelector players={players} />;
}
