import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { HeatmapViewer } from "./heatmap-viewer";

interface Props {
  params: Promise<{ matchId: string }>;
}

export default async function HeatmapPage({ params }: Props) {
  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      map: true,
      scoreCT: true,
      scoreT: true,
      players: {
        select: { steamId: true, name: true, team: true },
      },
    },
  });

  if (!match) notFound();

  const mapConfig = getMapConfig(match.map);

  return (
    <HeatmapViewer
      matchId={matchId}
      mapName={mapDisplayName(match.map)}
      mapRaw={match.map}
      mapConfig={mapConfig ? {
        posX: mapConfig.posX,
        posY: mapConfig.posY,
        scale: mapConfig.scale,
        width: mapConfig.width,
        height: mapConfig.height,
        radarImage: mapConfig.radarImage,
      } : null}
      players={match.players.map((p) => ({
        steamId: p.steamId,
        name: p.name,
        team: p.team as "CT" | "T",
      }))}
      scoreCT={match.scoreCT}
      scoreT={match.scoreT}
    />
  );
}
