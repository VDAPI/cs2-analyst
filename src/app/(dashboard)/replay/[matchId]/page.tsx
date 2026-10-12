import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { ReplayViewer } from "./replay-viewer";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ round?: string; tick?: string; player?: string; finding?: string }>;
}

export default async function ReplayPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  // Deep link to a moment (mechanics page, report): ?round=N&tick=T&player=S&finding=F
  const query = await searchParams;
  const session = await getServerSession(authOptions);
  const initialRound = Number(query.round) || 1;
  const initialTick = Number(query.tick) || null;

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
  // Open with the linked player selected, else the viewer themselves if they played.
  const inMatch = (id: string | null | undefined) => !!id && match.players.some((p) => p.steamId === id);
  const initialPlayer = inMatch(query.player) ? query.player! : inMatch(session?.user?.steamId) ? session!.user.steamId : null;

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
        radarImage: mapConfig.radarImage,
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
      initialRound={initialRound}
      initialTick={initialTick}
      initialPlayer={initialPlayer}
      initialFindingId={query.finding ?? null}
    />
  );
}
