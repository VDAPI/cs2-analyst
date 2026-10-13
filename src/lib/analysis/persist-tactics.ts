/**
 * Compute and store TacticsStats for one match from the data already in the
 * DB (Kill, DamageEvent, BombEvent, RoundPlayer, RoundTicks) — no .dem needed.
 * Called by the parse pipeline, and lazily by the findings for matches
 * analysed before S12 or with an older TACTICS_VERSION.
 */
import type { PrismaClient } from "@prisma/client";
import { decodeRoundTicksCached } from "@/lib/replay/decode-cache";
import { analyzeTactics, TACTICS_VERSION, type TacticsFrame, type TacticsInput } from "./tactics";
import { getMapPlaces } from "./persist-utility";
import type { SiteCentres } from "./sites";

/** The analysis input for one match from the DB, or null when there is nothing to analyse. */
export async function loadTacticsInput(prisma: PrismaClient, matchId: string): Promise<TacticsInput | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      tickRate: true,
      players: { select: { steamId: true, name: true, team: true } },
      rounds: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          startTick: true,
          endTick: true,
          winner: true,
          winReason: true,
          ctScore: true,
          tScore: true,
          ticks: true,
          kills: {
            select: {
              tick: true,
              attackerSteamId: true,
              victimSteamId: true,
              attackerPosX: true,
              attackerPosY: true,
              attackerPosZ: true,
              victimPosX: true,
              victimPosY: true,
              victimPosZ: true,
              weapon: true,
            },
          },
          damages: { select: { tick: true, attackerSteamId: true, victimSteamId: true } },
          bombs: {
            select: { tick: true, type: true, playerSteamId: true, posX: true, posY: true, posZ: true, site: true },
          },
          players: { select: { steamId: true, equipValue: true, money: true } },
        },
      },
    },
  });
  if (!match || match.rounds.length === 0 || !match.rounds.some((r) => r.kills.length > 0)) return null;

  return {
    tickRate: match.tickRate,
    players: match.players,
    rounds: match.rounds.map((r) => ({
      number: r.number,
      startTick: r.startTick,
      endTick: r.endTick,
      winner: r.winner,
      winReason: r.winReason,
      ctScore: r.ctScore,
      tScore: r.tScore,
      frames: r.ticks ? (decodeRoundTicksCached(r.ticks) as TacticsFrame[]) : [],
    })),
    kills: match.rounds.flatMap((r) => r.kills.map((k) => ({ ...k, roundNumber: r.number }))),
    damages: match.rounds.flatMap((r) => r.damages.map((d) => ({ ...d, roundNumber: r.number }))),
    bombs: match.rounds.flatMap((r) => r.bombs.map((b) => ({ ...b, roundNumber: r.number }))),
    economy: match.rounds.flatMap((r) => r.players.map((p) => ({ ...p, roundNumber: r.number }))),
  };
}

/** Returns the number of players stored, or 0 when the match has no rounds or kills. */
export async function computeAndPersistTactics(prisma: PrismaClient, matchId: string): Promise<number> {
  const input = await loadTacticsInput(prisma, matchId);
  if (!input) return 0;

  // Bombsite centres from the map's callouts (S31); without them the plants of this match stand in.
  let sites: SiteCentres | undefined;
  try {
    const match = await prisma.match.findUnique({ where: { id: matchId }, select: { map: true } });
    if (match) sites = (await getMapPlaces(prisma, match.map)).sites;
  } catch (error) {
    console.error(`[tactics] callouts unavailable match=${matchId}:`, error);
  }
  const results = analyzeTactics(input, { sites });

  // Serialised per match (like findings): two first views after a version
  // bump would otherwise interleave delete+insert and hit @@unique([matchId, steamId]).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tactics:${matchId}`}))`;
    await tx.tacticsStats.deleteMany({ where: { matchId } });
    await tx.tacticsStats.createMany({
      data: results.map(({ moments, ...rest }) => ({
        ...rest,
        matchId,
        version: TACTICS_VERSION,
        moments: moments as unknown as object,
      })),
    });
  });
  return results.length;
}

/** Stored stats, recomputed first when missing or from an older analysis version. */
export async function getTacticsStats(prisma: PrismaClient, matchId: string) {
  let rows = await prisma.tacticsStats.findMany({ where: { matchId } });
  if (rows.length === 0 || rows.some((r) => r.version !== TACTICS_VERSION)) {
    const stored = await computeAndPersistTactics(prisma, matchId);
    if (stored > 0) rows = await prisma.tacticsStats.findMany({ where: { matchId } });
  }
  return rows;
}
