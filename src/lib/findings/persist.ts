/**
 * Build and store a match's Findings from the stored analysis (MechanicsStats,
 * AimStats), and read them back. Called by the parse pipeline after the
 * mechanics/aim stats, and lazily by the report, the replay and the findings
 * API for matches analysed before S10 or with older analysis versions.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { getMechanicsStats } from "@/lib/analysis/persist-mechanics";
import { getAimStats } from "@/lib/analysis/persist-aim";
import { MECHANICS_VERSION, type MovementMoment } from "@/lib/analysis/movement";
import { AIM_VERSION, type AimMoment } from "@/lib/analysis/aim";
import { detectFindings, FINDINGS_VERSION } from "./detect";

/**
 * Stored findings are valid while detectors and the analyses they read are
 * unchanged; any version bump rebuilds them on next view.
 */
export const FINDINGS_STAMP = `f${FINDINGS_VERSION}.m${MECHANICS_VERSION}.a${AIM_VERSION}`;

/** Rebuild the match's findings. Returns how many were stored. */
export async function computeAndPersistFindings(prisma: PrismaClient, matchId: string): Promise<number> {
  const [mechanics, aim] = await Promise.all([getMechanicsStats(prisma, matchId), getAimStats(prisma, matchId)]);
  const drafts = detectFindings({
    mechanics: mechanics.map((m) => ({ steamId: m.steamId, moments: m.moments as unknown as MovementMoment[] })),
    aim: aim.map((a) => ({ steamId: a.steamId, moments: a.moments as unknown as AimMoment[] })),
  });

  await prisma.$transaction([
    prisma.finding.deleteMany({ where: { matchId } }),
    prisma.finding.createMany({
      data: drafts.map((d) => ({ ...d, matchId, values: d.values as unknown as Prisma.InputJsonValue })),
    }),
    // No stats yet (no replay data): leave the stamp unset so a later backfill
    // gets its findings built on the next view.
    prisma.match.update({
      where: { id: matchId },
      data: { findingsVersion: mechanics.length + aim.length > 0 ? FINDINGS_STAMP : null },
    }),
  ]);
  return drafts.length;
}

/** The match's findings (optionally one player's), rebuilt first when stale. */
export async function getFindings(prisma: PrismaClient, matchId: string, steamId?: string) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { findingsVersion: true } });
  if (!match) return [];
  if (match.findingsVersion !== FINDINGS_STAMP) await computeAndPersistFindings(prisma, matchId);
  return prisma.finding.findMany({
    where: { matchId, ...(steamId ? { steamId } : {}) },
    orderBy: [{ roundNumber: "asc" }, { tick: "asc" }],
  });
}
