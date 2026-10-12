import { NextResponse } from "next/server";
import { getMatchAccess, roundAllowed } from "@/lib/sharing/access";
import { GrenadeType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/grenades?round=N&type=SMOKE&player=steamId
 */
export async function GET(req: Request, { params }: Props) {
  const { matchId } = await params;
  // The uploader, or a share link of this match (S16).
  const access = await getMatchAccess(req, matchId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const roundFilter = url.searchParams.get("round") || null;
  const typeFilter = url.searchParams.get("type");
  const playerFilter = url.searchParams.get("player");

  // One parse for both the access check and the query ("3e1" must not pass
  // as 30 and then read round 3).
  const roundNum = roundFilter != null && /^\d{1,3}$/.test(roundFilter) ? Number(roundFilter) : null;
  if (roundFilter != null && roundNum == null) {
    return NextResponse.json({ error: "Invalid round" }, { status: 400 });
  }
  // A moment link reads only its own round.
  if (access.round != null && (roundNum == null || !roundAllowed(access, roundNum))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const types = Object.values(GrenadeType) as string[];
  if (typeFilter && !types.includes(typeFilter)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const match = await prisma.match.findFirst({
    where: { id: matchId },
    select: { id: true, map: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build where clause
  const where: Record<string, unknown> = { round: { matchId } };
  if (typeFilter) where.grenadeType = typeFilter;
  if (playerFilter) where.throwerSteamId = playerFilter;
  if (roundNum != null) where.round = { matchId, number: roundNum };

  const grenades = await prisma.grenadeEvent.findMany({
    where,
    select: {
      id: true,
      tick: true,
      throwerSteamId: true,
      throwerName: true,
      grenadeType: true,
      throwPosX: true,
      throwPosY: true,
      throwPosZ: true,
      landPosX: true,
      landPosY: true,
      landPosZ: true,
      damageDealt: true,
      playersFlashed: true,
      duration: true,
      round: { select: { number: true } },
    },
    orderBy: { tick: "asc" },
  });

  const players = await prisma.matchPlayer.findMany({
    where: { matchId },
    select: { steamId: true, name: true, team: true },
  });

  // Build per-player stats
  const perPlayer: Record<string, {
    steamId: string;
    name: string;
    team: string;
    smokes: number;
    flashes: number;
    hes: number;
    molotovs: number;
    flashEnemies: number;
    utilDamage: number;
  }> = {};

  for (const p of players) {
    perPlayer[p.steamId] = {
      steamId: p.steamId,
      name: p.name,
      team: p.team,
      smokes: 0,
      flashes: 0,
      hes: 0,
      molotovs: 0,
      flashEnemies: 0,
      utilDamage: 0,
    };
  }

  // Stats over every grenade of the match (not filtered), except for a
  // moment link, which only sees its own round.
  const allGrenades = await prisma.grenadeEvent.findMany({
    where: { round: access.round != null ? { matchId, number: access.round } : { matchId } },
    select: {
      throwerSteamId: true,
      grenadeType: true,
      damageDealt: true,
      playersFlashed: true,
    },
  });

  for (const g of allGrenades) {
    const s = perPlayer[g.throwerSteamId];
    if (!s) continue;
    switch (g.grenadeType) {
      case "SMOKE": s.smokes++; break;
      case "FLASH": s.flashes++; s.flashEnemies += g.playersFlashed; break;
      case "HE": s.hes++; s.utilDamage += g.damageDealt; break;
      case "MOLOTOV":
      case "INCENDIARY": s.molotovs++; s.utilDamage += g.damageDealt; break;
    }
  }

  return NextResponse.json({
    matchId,
    map: match.map,
    grenades: grenades.map((g) => ({
      id: g.id,
      tick: g.tick,
      round: g.round.number,
      throwerSteamId: g.throwerSteamId,
      throwerName: g.throwerName,
      type: g.grenadeType,
      throwPos: { x: g.throwPosX, y: g.throwPosY, z: g.throwPosZ },
      landPos: { x: g.landPosX, y: g.landPosY, z: g.landPosZ },
      damageDealt: g.damageDealt,
      playersFlashed: g.playersFlashed,
      duration: g.duration,
    })),
    players: players.map((p) => ({
      steamId: p.steamId,
      name: p.name,
      team: p.team,
    })),
    stats: Object.values(perPlayer),
  });
}
