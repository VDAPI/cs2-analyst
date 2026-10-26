import { prisma } from "@/lib/db/prisma";
import { ownMatchWhere } from "@/lib/sharing/access";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import { ReplayViewer } from "./replay-viewer";
import { decodePlaylist, playlistHref } from "@/lib/replay/playlist";

interface Props {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ round?: string; tick?: string; player?: string; finding?: string; pl?: string; pi?: string; view?: string }>;
}

export default async function ReplayPage({ params, searchParams }: Props) {
  const { matchId } = await params;
  // Deep link to a moment (mechanics page, report): ?round=N&tick=T&player=S&finding=F
  const query = await searchParams;
  const session = await getServerSession(authOptions);
  const initialRound = Number(query.round) || 1;
  const initialTick = Number(query.tick) || null;

  // The uploader's own match, or a team / rival match of a teammate (S17,
  // read-only): the replay APIs (ticks, kills, bombs) answer the owner, a
  // teammate of such a match or a share token; shares open /s/[token] instead.
  const where = await ownMatchWhere(matchId, { allowTeam: true });
  if (!where) notFound();

  const match = await prisma.match.findFirst({
    where,
    include: {
      upload: { select: { userId: true } },
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

  // A playlist from the team analysis: the rounds to step through (?pl=&pi=).
  const entries = decodePlaylist(query.pl);
  const pi = Math.min(Math.max(0, Number(query.pi) || 0), Math.max(0, entries.length - 1));
  const full = query.view === "full";
  const playlist =
    entries.length > 1
      ? {
          index: pi,
          total: entries.length,
          prevHref: pi > 0 ? playlistHref(entries, pi - 1, full) : null,
          nextHref: pi < entries.length - 1 ? playlistHref(entries, pi + 1, full) : null,
        }
      : null;

  return (
    <ReplayViewer
      // A new round of the playlist remounts the viewer on that round.
      key={`${matchId}:${initialRound}:${initialTick ?? ""}`}
      playlist={playlist}
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
      readOnly={match.upload?.userId !== session?.user?.id}
    />
  );
}
