import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/heatmap?type=kills|deaths&side=CT|T&player=steamId
 *
 * Returns position data for heatmap generation.
 * - kills: attacker positions where kills happened
 * - deaths: victim positions where deaths happened
 */
export async function GET(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "kills";
  const side = url.searchParams.get("side"); // CT, T, or null for all
  const playerSteamId = url.searchParams.get("player"); // specific player or null

  // Verify match exists and belongs to user
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      map: true,
      upload: { select: { userId: true } },
    },
  });

  if (!match || match.upload?.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get all kills for this match (include round number for team-side resolution)
  const kills = await prisma.kill.findMany({
    where: {
      round: { matchId },
    },
    select: {
      attackerSteamId: true,
      attackerName: true,
      victimSteamId: true,
      victimName: true,
      attackerPosX: true,
      attackerPosY: true,
      victimPosX: true,
      victimPosY: true,
      weapon: true,
      headshot: true,
      round: { select: { number: true } },
    },
  });

  // Get player roster for team info
  // matchPlayer.team is the END-OF-MATCH team (second-half side).
  // In first half (rounds 1-12), sides are SWAPPED relative to the DB value.
  const players = await prisma.matchPlayer.findMany({
    where: { matchId },
    select: { steamId: true, name: true, team: true },
  });
  const dbTeamBySteamId = new Map(players.map((p) => [p.steamId, p.team]));

  function getInGameTeam(steamId: string, roundNumber: number): string | undefined {
    const dbTeam = dbTeamBySteamId.get(steamId);
    if (!dbTeam) return undefined;
    if (roundNumber <= 12) return dbTeam === "CT" ? "T" : "CT";
    return dbTeam;
  }

  // Build points based on type
  const points: Array<{ x: number; y: number; name: string; weapon: string; headshot: boolean }> = [];

  for (const k of kills) {
    const roundNum = k.round.number;
    if (type === "kills") {
      if (side) {
        const team = getInGameTeam(k.attackerSteamId, roundNum);
        if (team !== side) continue;
      }
      if (playerSteamId && k.attackerSteamId !== playerSteamId) continue;
      points.push({
        x: k.attackerPosX,
        y: k.attackerPosY,
        name: k.attackerName,
        weapon: k.weapon,
        headshot: k.headshot,
      });
    } else {
      if (side) {
        const team = getInGameTeam(k.victimSteamId, roundNum);
        if (team !== side) continue;
      }
      if (playerSteamId && k.victimSteamId !== playerSteamId) continue;
      points.push({
        x: k.victimPosX,
        y: k.victimPosY,
        name: k.victimName,
        weapon: k.weapon,
        headshot: k.headshot,
      });
    }
  }

  return NextResponse.json({
    matchId,
    map: match.map,
    type,
    pointCount: points.length,
    points,
    players: players.map((p) => ({
      steamId: p.steamId,
      name: p.name,
      team: p.team,
    })),
  });
}
