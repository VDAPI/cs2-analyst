import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { CrossMatchHeatmap } from "./cross-match-viewer";

interface Props {
  params: Promise<{ mapName: string }>;
}

export default async function MapHeatmapPage({ params }: Props) {
  const { mapName } = await params;
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) notFound();

  const mapConfig = getMapConfig(mapName);

  // Get all user's matches on this map
  const matches = await prisma.match.findMany({
    where: { map: mapName, upload: { userId } },
    select: {
      id: true,
      date: true,
      scoreCT: true,
      scoreT: true,
      players: {
        select: { steamId: true, name: true, team: true },
      },
    },
    orderBy: { date: "desc" },
  });

  if (matches.length === 0) notFound();

  // Deduplicate players across all matches
  const playerMap = new Map<string, { steamId: string; name: string; team: string }>();
  for (const m of matches) {
    for (const p of m.players) {
      playerMap.set(p.steamId, { steamId: p.steamId, name: p.name, team: p.team });
    }
  }
  const allPlayers = Array.from(playerMap.values());

  return (
    <CrossMatchHeatmap
      mapName={mapDisplayName(mapName)}
      mapRaw={mapName}
      mapConfig={mapConfig ? {
        posX: mapConfig.posX,
        posY: mapConfig.posY,
        scale: mapConfig.scale,
        width: mapConfig.width,
        height: mapConfig.height,
        radarImage: mapConfig.radarImage,
      } : null}
      matches={matches.map((m) => ({
        id: m.id,
        date: m.date.toISOString(),
        scoreCT: m.scoreCT,
        scoreT: m.scoreT,
      }))}
      players={allPlayers.map((p) => ({
        steamId: p.steamId,
        name: p.name,
        team: p.team as "CT" | "T",
      }))}
    />
  );
}
