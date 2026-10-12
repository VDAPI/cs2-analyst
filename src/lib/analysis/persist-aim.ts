/**
 * Compute and store AimStats for one match from the replay data already in the
 * DB (RoundTicks, ShotEvent, DamageEvent, ReloadEvent, Kill, GrenadeEvent) — no
 * .dem needed. Called by the parse pipeline, and lazily by the mechanics page
 * for matches analysed before S9 or with an older AIM_VERSION.
 */
import type { PrismaClient } from "@prisma/client";
import { decodeRoundTicks } from "@/lib/replay/round-ticks";
import { analyzeAim, AIM_VERSION, type AimFrame, type AimInput } from "./aim";

/** The analysis input for one match from the DB, or null when there is nothing to analyse. */
export async function loadAimInput(prisma: PrismaClient, matchId: string): Promise<AimInput | null> {
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
          shots: { select: { tick: true, steamId: true, weapon: true, velX: true, velY: true, velZ: true } },
          damages: { select: { tick: true, attackerSteamId: true, victimSteamId: true, weapon: true } },
          kills: { select: { tick: true, attackerSteamId: true, victimSteamId: true } },
          grenades: { where: { grenadeType: "FLASH" }, select: { tick: true, throwerSteamId: true } },
          reloads: { select: { tick: true, steamId: true, weapon: true, clip: true } },
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
      frames: r.ticks ? (decodeRoundTicks(r.ticks) as AimFrame[]) : [],
    })),
    shots: match.rounds.flatMap((r) => r.shots.map((s) => ({ ...s, roundNumber: r.number }))),
    damages: match.rounds.flatMap((r) => r.damages.map((d) => ({ ...d, roundNumber: r.number }))),
    kills: match.rounds.flatMap((r) => r.kills.map((k) => ({ ...k, roundNumber: r.number }))),
    flashes: match.rounds.flatMap((r) => r.grenades.map((g) => ({ ...g, roundNumber: r.number }))),
    reloads: match.rounds.flatMap((r) => r.reloads.map((l) => ({ ...l, roundNumber: r.number }))),
  };
}

/** Returns the number of players stored, or 0 when the match has no replay data. */
export async function computeAndPersistAim(prisma: PrismaClient, matchId: string): Promise<number> {
  const input = await loadAimInput(prisma, matchId);
  if (!input) return 0;

  const results = analyzeAim(input);

  await prisma.$transaction([
    prisma.aimStats.deleteMany({ where: { matchId } }),
    prisma.aimStats.createMany({
      data: results.map(({ peekTypes, moments, ...rest }) => ({
        ...rest,
        matchId,
        version: AIM_VERSION,
        peekTypes: peekTypes as unknown as object,
        moments: moments as unknown as object,
      })),
    }),
  ]);
  return results.length;
}

/** Stored stats, recomputed first when missing or from an older analysis version. */
export async function getAimStats(prisma: PrismaClient, matchId: string) {
  let rows = await prisma.aimStats.findMany({ where: { matchId } });
  if (rows.length === 0 || rows.some((r) => r.version !== AIM_VERSION)) {
    const stored = await computeAndPersistAim(prisma, matchId);
    if (stored > 0) rows = await prisma.aimStats.findMany({ where: { matchId } });
  }
  return rows;
}
