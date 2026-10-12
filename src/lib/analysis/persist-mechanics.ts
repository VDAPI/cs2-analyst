/**
 * Compute and store MechanicsStats for one match from the replay data already
 * in the DB (ShotEvent, DamageEvent, RoundTicks) — no .dem needed. Called by
 * the parse pipeline, and lazily by the mechanics page for matches analysed
 * before this existed or with an older MECHANICS_VERSION.
 */
import type { PrismaClient } from "@prisma/client";
import { decodeRoundTicks } from "@/lib/replay/round-ticks";
import { analyzeMovement, MECHANICS_VERSION, type FrameInput, type MovementInput } from "./movement";

/** The analysis input for one match from the DB, or null when there is nothing to analyse. */
export async function loadMechanicsInput(prisma: PrismaClient, matchId: string): Promise<MovementInput | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      tickRate: true,
      rounds: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          startTick: true,
          ticks: true,
          shots: {
            select: { tick: true, steamId: true, weapon: true, velX: true, velY: true, velZ: true },
          },
          damages: {
            select: {
              tick: true,
              attackerSteamId: true,
              victimSteamId: true,
              weapon: true,
              hitgroup: true,
            },
          },
        },
      },
    },
  });
  if (!match || !match.rounds.some((r) => r.ticks)) return null;

  return {
    tickRate: match.tickRate,
    rounds: match.rounds.map((r) => ({
      number: r.number,
      startTick: r.startTick,
      frames: r.ticks ? (decodeRoundTicks(r.ticks) as FrameInput[]) : [],
    })),
    shots: match.rounds.flatMap((r) => r.shots.map((s) => ({ ...s, roundNumber: r.number }))),
    damages: match.rounds.flatMap((r) => r.damages.map((d) => ({ ...d, roundNumber: r.number }))),
  };
}

/** Returns the number of players stored, or 0 when the match has no replay data. */
export async function computeAndPersistMechanics(
  prisma: PrismaClient,
  matchId: string
): Promise<number> {
  const input = await loadMechanicsInput(prisma, matchId);
  if (!input) return 0;

  const results = analyzeMovement(input);

  await prisma.$transaction([
    prisma.mechanicsStats.deleteMany({ where: { matchId } }),
    prisma.mechanicsStats.createMany({
      data: results.map(({ weapons, moments, ...rest }) => ({
        ...rest,
        matchId,
        version: MECHANICS_VERSION,
        weapons: weapons as unknown as object,
        moments: moments as unknown as object,
      })),
    }),
  ]);
  return results.length;
}

/** Stored stats, recomputed first when missing or from an older analysis version. */
export async function getMechanicsStats(prisma: PrismaClient, matchId: string) {
  let rows = await prisma.mechanicsStats.findMany({ where: { matchId } });
  if (rows.length === 0 || rows.some((r) => r.version !== MECHANICS_VERSION)) {
    const stored = await computeAndPersistMechanics(prisma, matchId);
    if (stored > 0) rows = await prisma.mechanicsStats.findMany({ where: { matchId } });
  }
  return rows;
}
