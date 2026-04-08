import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/heatmap?map=de_mirage&type=kills|deaths&side=CT|T&player=steamId&matches=id1,id2
 *
 * Returns position data for heatmap generation across one or more matches.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const mapName = url.searchParams.get("map");
  const type = url.searchParams.get("type") ?? "kills";
  const side = url.searchParams.get("side");
  const playerSteamId = url.searchParams.get("player");
  const matchIds = url.searchParams.get("matches")?.split(",").filter(Boolean);

  if (!mapName) {
    return NextResponse.json({ error: "map is required" }, { status: 400 });
  }

  // Get all user's matches on this map (or filtered set)
  const whereClause = {
    map: mapName,
    upload: { userId: session.user.id },
    ...(matchIds?.length ? { id: { in: matchIds } } : {}),
  };

  const matches = await prisma.match.findMany({
    where: whereClause,
    select: { id: true },
  });

  if (matches.length === 0) {
    return NextResponse.json({ points: [], players: [], pointCount: 0 });
  }

  const matchIdList = matches.map((m) => m.id);

  // Get all kills across selected matches (include round number for team-side resolution)
  const kills = await prisma.kill.findMany({
    where: { round: { matchId: { in: matchIdList } } },
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

  // Get player roster across all matches (deduplicated)
  const allPlayers = await prisma.matchPlayer.findMany({
    where: { matchId: { in: matchIdList } },
    select: { steamId: true, name: true, team: true },
  });

  // Build team lookup — matchPlayer.team is the END-OF-MATCH team (second-half side).
  // In first half (rounds 1-12), sides are SWAPPED relative to the DB value.
  const dbTeamBySteamId = new Map<string, string>();
  const playerNames = new Map<string, string>();
  for (const p of allPlayers) {
    dbTeamBySteamId.set(p.steamId, p.team);
    playerNames.set(p.steamId, p.name);
  }

  /** Get a player's in-game team for a specific round, accounting for side swap at halftime. */
  function getInGameTeam(steamId: string, roundNumber: number): string | undefined {
    const dbTeam = dbTeamBySteamId.get(steamId);
    if (!dbTeam) return undefined;
    // First half (rounds 1-12): sides are opposite to DB value
    if (roundNumber <= 12) return dbTeam === "CT" ? "T" : "CT";
    // Second half (round 13+): sides match DB value
    return dbTeam;
  }

  // Deduplicated player list (use DB team for display — represents "home" side)
  const uniquePlayers = Array.from(playerNames.entries()).map(([steamId, name]) => ({
    steamId,
    name,
    team: dbTeamBySteamId.get(steamId) ?? "CT",
  }));

  // Build points
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
    map: mapName,
    type,
    matchCount: matches.length,
    pointCount: points.length,
    points,
    players: uniquePlayers,
  });
}
