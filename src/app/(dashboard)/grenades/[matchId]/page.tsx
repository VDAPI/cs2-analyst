import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { GrenadeViewer } from "./grenade-viewer";

interface Props {
  params: Promise<{ matchId: string }>;
}

export default async function GrenadeAnalysisPage({ params }: Props) {
  const { matchId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

  const match = await prisma.match.findFirst({
    where: { id: matchId, upload: { userId: session.user.id } },
    select: {
      id: true,
      map: true,
      scoreCT: true,
      scoreT: true,
      players: {
        select: { steamId: true, name: true, team: true },
      },
      rounds: {
        select: { number: true },
        orderBy: { number: "asc" },
      },
    },
  });

  if (!match) notFound();

  const mapConfig = getMapConfig(match.map);

  return (
    <GrenadeViewer
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
      totalRounds={match.rounds.length}
      scoreCT={match.scoreCT}
      scoreT={match.scoreT}
    />
  );
}
