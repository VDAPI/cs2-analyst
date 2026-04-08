import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { ReplayViewer } from "./replay-viewer";

interface Props {
  params: Promise<{ matchId: string }>;
}

export default async function ReplayPage({ params }: Props) {
  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      rounds: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          winner: true,
          winReason: true,
          startTick: true,
          endTick: true,
          ctScore: true,
          tScore: true,
        },
      },
      players: {
        select: {
          steamId: true,
          name: true,
          team: true,
        },
      },
    },
  });

  if (!match) notFound();

  const mapConfig = getMapConfig(match.map);

  return (
    <ReplayViewer
      matchId={matchId}
      mapName={mapDisplayName(match.map)}
      mapConfig={mapConfig ? {
        posX: mapConfig.posX,
        posY: mapConfig.posY,
        scale: mapConfig.scale,
        width: mapConfig.width,
        height: mapConfig.height,
      } : null}
      rounds={match.rounds.map((r) => ({
        number: r.number,
        winner: r.winner as "CT" | "T",
        winReason: r.winReason,
        ctScore: r.ctScore,
        tScore: r.tScore,
      }))}
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
