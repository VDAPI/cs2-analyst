import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { createSideResolver } from "@/lib/utils/sideSplit";

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
    upload: { userId: session.user.id, deletedAt: null },
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
      round: { select: { number: true, matchId: true } },
    },
  });

  // Get player roster across all matches (deduplicated)
  const [allPlayers, allRounds] = await Promise.all([
    prisma.matchPlayer.findMany({
      where: { matchId: { in: matchIdList } },
      select: { matchId: true, steamId: true, name: true, team: true },
    }),
    prisma.round.findMany({
      where: { matchId: { in: matchIdList } },
      select: { matchId: true, number: true, winner: true, ctScore: true, tScore: true },
    }),
  ]);

  // Side resolver per match: sides come from the stored rounds (halves,
  // overtime, matches that end early), not a fixed 12-round rule.
  const roundsByMatch = new Map<string, typeof allRounds>();
  for (const r of allRounds) {
    const list = roundsByMatch.get(r.matchId);
    if (list) list.push(r);
    else roundsByMatch.set(r.matchId, [r]);
  }
  const sideAtByMatch = new Map(
    matchIdList.map((id) => [id, createSideResolver(roundsByMatch.get(id) ?? [])])
  );

  // Team lookup per (match, player) — matchPlayer.team is the END-OF-MATCH
  // side of that match, and the same player can finish on CT in one match and
  // on T in another, so a per-steamId map would put whole matches on the
  // wrong side.
  const dbTeamByMatchPlayer = new Map<string, "CT" | "T">();
  const playerNames = new Map<string, string>();
  // Display team: the side the player finished on most often (ties → CT).
  const finishedCT = new Map<string, number>();
  for (const p of allPlayers) {
    dbTeamByMatchPlayer.set(`${p.matchId}:${p.steamId}`, p.team);
    playerNames.set(p.steamId, p.name);
    finishedCT.set(p.steamId, (finishedCT.get(p.steamId) ?? 0) + (p.team === "CT" ? 1 : -1));
  }

  /** A player's in-game side in one round of one match (halftime swap included). */
  function getInGameTeam(matchId: string, steamId: string, roundNumber: number): "CT" | "T" | undefined {
    const dbTeam = dbTeamByMatchPlayer.get(`${matchId}:${steamId}`);
    const sideAt = sideAtByMatch.get(matchId);
    return dbTeam && sideAt ? sideAt(dbTeam, roundNumber) : undefined;
  }

  // Deduplicated player list
  const uniquePlayers = Array.from(playerNames.entries()).map(([steamId, name]) => ({
    steamId,
    name,
    team: (finishedCT.get(steamId) ?? 0) >= 0 ? "CT" : "T",
  }));

  // Build points
  const points: Array<{ x: number; y: number; name: string; weapon: string; headshot: boolean }> = [];

  for (const k of kills) {
    const roundNum = k.round.number;
    // Suicides / world deaths (attacker = victim) are not kills.
    if (type === "kills" && k.attackerSteamId === k.victimSteamId) continue;
    // Team kills are not kills either (same end-of-match team in that match).
    if (type === "kills") {
      const aTeam = dbTeamByMatchPlayer.get(`${k.round.matchId}:${k.attackerSteamId}`);
      if (aTeam && aTeam === dbTeamByMatchPlayer.get(`${k.round.matchId}:${k.victimSteamId}`)) continue;
    }
    if (type === "kills") {
      if (side) {
        const team = getInGameTeam(k.round.matchId, k.attackerSteamId, roundNum);
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
        const team = getInGameTeam(k.round.matchId, k.victimSteamId, roundNum);
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
