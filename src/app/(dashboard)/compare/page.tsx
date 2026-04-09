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
        },
      })
    : [];

  // Aggregate by steamId
  const playerMap = new Map<string, PlayerSummary>();

  for (const p of matchPlayers) {
    const existing = playerMap.get(p.steamId);
    if (existing) {
      existing.matchCount++;
      existing.name = p.name;
    } else {
      playerMap.set(p.steamId, {
        steamId: p.steamId,
        name: p.name,
        matchCount: 1,
      });
    }
  }

  const players = Array.from(playerMap.values()).sort(
    (a, b) => b.matchCount - a.matchCount
  );

  return <PlayerSelector players={players} />;
}
