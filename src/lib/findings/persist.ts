/**
 * Build and store a match's Findings from the stored analysis (MechanicsStats,
 * AimStats, TacticsStats, UtilityStats), and read them back. Called by the parse pipeline after the
 * mechanics/aim/tactics/utility stats, and lazily by the report, the replay and the findings
 * API for matches analysed before S10 or with older analysis versions.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { getMechanicsStats } from "@/lib/analysis/persist-mechanics";
import { getAimStats } from "@/lib/analysis/persist-aim";
import { MECHANICS_VERSION, type MovementMoment } from "@/lib/analysis/movement";
import { AIM_VERSION, type AimMoment } from "@/lib/analysis/aim";
import { getMapLineups, getPlaceLookup, getUtilityStats } from "@/lib/analysis/persist-utility";
import { UTILITY_VERSION, type UtilityMoment, type UtilityThrow } from "@/lib/analysis/utility";
import { getTacticsStats } from "@/lib/analysis/persist-tactics";
import { TACTICS_VERSION, type TacticsMoment } from "@/lib/analysis/tactics";
import { detectFindings, FINDINGS_VERSION } from "./detect";

/**
 * Stored findings are valid while detectors and the analyses they read are
 * unchanged; any version bump rebuilds them on next view.
 */
export const FINDINGS_STAMP = `f${FINDINGS_VERSION}.m${MECHANICS_VERSION}.a${AIM_VERSION}.t${TACTICS_VERSION}.u${UTILITY_VERSION}`;

/** Rebuild the match's findings. Returns how many were stored. */
export async function computeAndPersistFindings(prisma: PrismaClient, matchId: string): Promise<number> {
  const [mechanics, aim, tactics, utility, match] = await Promise.all([
    getMechanicsStats(prisma, matchId),
    getAimStats(prisma, matchId),
    getTacticsStats(prisma, matchId),
    getUtilityStats(prisma, matchId),
    prisma.match.findUnique({ where: { id: matchId }, select: { map: true } }),
  ]);
  // Callouts and the lineup base are map-wide; a failure only loses names/hints.
  let utilityContext = {};
  if (match && utility.length > 0) {
    try {
      const placeOf = await getPlaceLookup(prisma, match.map);
      utilityContext = { placeOf, lineups: await getMapLineups(prisma, match.map, placeOf) };
    } catch (error) {
      console.error(`[findings] lineups/callouts unavailable match=${matchId}:`, error);
    }
  }
  const drafts = detectFindings({
    mechanics: mechanics.map((m) => ({ steamId: m.steamId, moments: m.moments as unknown as MovementMoment[] })),
    aim: aim.map((a) => ({ steamId: a.steamId, moments: a.moments as unknown as AimMoment[] })),
    tactics: tactics.map((t) => ({ steamId: t.steamId, moments: t.moments as unknown as TacticsMoment[] })),
    utility: utility.map((u) => ({
      steamId: u.steamId,
      moments: u.moments as unknown as UtilityMoment[],
      throws: u.throws as unknown as UtilityThrow[],
    })),
    utilityContext,
  });

  // Serialised per match: the report and the replay can both trigger a
  // rebuild on first view, and two interleaved delete+insert runs would
  // otherwise leave every finding twice.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`findings:${matchId}`}))`;
    await tx.finding.deleteMany({ where: { matchId } });
    await tx.finding.createMany({
      data: drafts.map((d) => ({ ...d, matchId, values: d.values as unknown as Prisma.InputJsonValue })),
    });
    // No stats yet (no replay data): leave the stamp unset so a later backfill
    // gets its findings built on the next view.
    await tx.match.update({
      where: { id: matchId },
      data: { findingsVersion: mechanics.length + aim.length + tactics.length + utility.length > 0 ? FINDINGS_STAMP : null },
    });
  });
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
