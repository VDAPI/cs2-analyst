import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/grenades?round=N&type=SMOKE&player=steamId
 */
export async function GET(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const url = new URL(req.url);
  const roundFilter = url.searchParams.get("round");
  const typeFilter = url.searchParams.get("type");
  const playerFilter = url.searchParams.get("player");

  const match = await prisma.match.findFirst({
    where: { id: matchId, upload: { userId: session.user.id } },
    select: { id: true, map: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build where clause
  const where: Record<string, unknown> = { round: { matchId } };
  if (typeFilter) where.grenadeType = typeFilter;
  if (playerFilter) where.throwerSteamId = playerFilter;
  if (roundFilter) where.round = { matchId, number: parseInt(roundFilter, 10) };

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

  // Use ALL grenades for stats (not filtered)
  const allGrenades = await prisma.grenadeEvent.findMany({
    where: { round: { matchId } },
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
