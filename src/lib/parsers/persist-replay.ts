/**
 * Write replay data (RoundTicks, ShotEvent, DamageEvent, ReloadEvent) for one match,
 * replacing whatever was stored before. Shared by the parse pipeline and
 * scripts/backfill-replay-ticks.ts.
 */
import type { PrismaClient } from "@prisma/client";
import { parseReplayData, type ReplayData } from "./replay-data";

export interface ReplayStorageStats {
  rounds: number;
  tickBytes: number;
  shots: number;
  damages: number;
  reloads: number;
}

/** Parse the demo's replay data and store it for `matchId`. */
export async function parseAndPersistReplayData(
  prisma: PrismaClient,
  matchId: string,
  filePath: string
): Promise<ReplayStorageStats> {
  const rounds = await prisma.round.findMany({
    where: { matchId },
    select: { id: true, number: true, startTick: true, endTick: true },
    orderBy: { number: "asc" },
  });
  const data = await parseReplayData(filePath, rounds);
  return persistReplayData(prisma, rounds, data);
}

export async function persistReplayData(
  prisma: PrismaClient,
  rounds: Array<{ id: string; number: number }>,
  data: ReplayData
): Promise<ReplayStorageStats> {
  const roundIdByNumber = new Map(rounds.map((r) => [r.number, r.id]));
  const roundIds = rounds.map((r) => r.id);

  const tickRows = [...data.roundTicks.entries()]
    .filter(([n]) => roundIdByNumber.has(n))
    .map(([n, t]) => ({
      roundId: roundIdByNumber.get(n)!,
      version: t.version,
      startTick: t.startTick,
      interval: t.interval,
      frameCount: t.frameCount,
      players: t.players as unknown as object,
      weapons: t.weapons,
      data: Buffer.from(t.data),
      byteSize: t.data.byteLength,
    }));

  const shotRows = data.shots
    .filter((s) => roundIdByNumber.has(s.roundNumber))
    .map(({ roundNumber, ...s }) => ({ roundId: roundIdByNumber.get(roundNumber)!, ...s }));

  const reloadRows = data.reloads
    .filter((r) => roundIdByNumber.has(r.roundNumber))
    .map(({ roundNumber, ...r }) => ({ roundId: roundIdByNumber.get(roundNumber)!, ...r }));

  const damageRows = data.damages
    .filter((d) => roundIdByNumber.has(d.roundNumber))
    .map(({ roundNumber, ...d }) => ({ roundId: roundIdByNumber.get(roundNumber)!, ...d }));

  await prisma.$transaction([
    prisma.roundTicks.deleteMany({ where: { roundId: { in: roundIds } } }),
    prisma.shotEvent.deleteMany({ where: { roundId: { in: roundIds } } }),
    prisma.damageEvent.deleteMany({ where: { roundId: { in: roundIds } } }),
    prisma.reloadEvent.deleteMany({ where: { roundId: { in: roundIds } } }),
    prisma.roundTicks.createMany({ data: tickRows }),
    prisma.shotEvent.createMany({ data: shotRows }),
    prisma.damageEvent.createMany({ data: damageRows }),
    prisma.reloadEvent.createMany({ data: reloadRows }),
  ]);

  return {
    rounds: tickRows.length,
    tickBytes: tickRows.reduce((sum, r) => sum + r.byteSize, 0),
    shots: shotRows.length,
    damages: damageRows.length,
    reloads: reloadRows.length,
  };
}

export function formatReplayStats(s: ReplayStorageStats): string {
  return `${s.rounds} rounds, ticks ${(s.tickBytes / 1024).toFixed(0)} KiB, ${s.shots} shots, ${s.damages} damage events, ${s.reloads} reloads`;
}
