/**
 * Role corrections from the DB (S31): the uploader's per-match corrections
 * (RoleOverride) and usual roles (User.roleDefaults), and the role every
 * player had in every round of a match for the role-aware findings. Pure
 * rules are in effective.ts.
 */
import type { PrismaClient } from "@prisma/client";
import { loadTacticsInput } from "@/lib/analysis/persist-tactics";
import { getMapPlaces } from "@/lib/analysis/persist-utility";
import { detectRoles } from "./roles";
import {
  asRoleDefaults,
  effectiveRoles,
  isSideRole,
  roleOfRound,
  type RoleCorrection,
  type RoleDefaults,
  type RoleOf,
  type RoleSide,
} from "./effective";

/** A match's corrections and its uploader's usual roles. */
export async function loadRoleCorrections(
  prisma: PrismaClient,
  matchId: string
): Promise<{ corrections: RoleCorrection[]; defaults: RoleDefaults | null }> {
  const [rows, match] = await Promise.all([
    prisma.roleOverride.findMany({ where: { matchId }, select: { steamId: true, side: true, role: true } }),
    prisma.match.findUnique({ where: { id: matchId }, select: { upload: { select: { user: { select: { roleDefaults: true } } } } } }),
  ]);
  const corrections = rows.flatMap((r): RoleCorrection[] => {
    const side = r.side as RoleSide;
    return (side === "T" || side === "CT") && isSideRole(side, r.role) ? [{ steamId: r.steamId, side, role: r.role }] : [];
  });
  return { corrections, defaults: asRoleDefaults(match?.upload?.user?.roleDefaults) };
}

/**
 * Every player's role in every round of the match (detected, then corrected),
 * or null when the match has nothing to analyse.
 */
export async function loadMatchRoleOf(prisma: PrismaClient, matchId: string, map: string): Promise<RoleOf | null> {
  const input = await loadTacticsInput(prisma, matchId);
  if (!input) return null;
  const [{ placeOf, sites, named }, { corrections, defaults }] = await Promise.all([
    getMapPlaces(prisma, map),
    loadRoleCorrections(prisma, matchId),
  ]);
  const detected = detectRoles(input, { placeOf: named ? placeOf : undefined, sites });
  return roleOfRound(input, effectiveRoles(detected, corrections, defaults));
}

/**
 * After a correction the findings of the affected matches are rebuilt on the
 * next view: their stamp is cleared (the rebuild reads the corrections).
 */
export async function invalidateFindings(
  prisma: PrismaClient,
  where: { matchId: string } | { userId: string; steamId: string }
) {
  await prisma.match.updateMany({
    where:
      "matchId" in where
        ? { id: where.matchId }
        : { upload: { userId: where.userId }, players: { some: { steamId: where.steamId } } },
    data: { findingsVersion: null },
  });
}
