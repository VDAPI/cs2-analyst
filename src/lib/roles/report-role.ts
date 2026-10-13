/**
 * The report's "your role" card (S24): the match role, the role per side,
 * the role's key metrics against pros of that role and the advice that
 * follows. Since S31 also where the player stood (callouts per round, zones,
 * isolation), how active they were, and the role corrected by hand (the
 * uploader's correction wins over detection). Null when the role can't be
 * read (the report renders without it).
 */
import type { PrismaClient } from "@prisma/client";
import { getNormTable } from "@/lib/norms/persist";
import { rolePool } from "@/lib/norms/norms";
import type { Role } from "./roles";
import { loadMatchRole } from "./persist";
import { loadRoleCorrections } from "./corrections";
import { resolve, type EffectiveRoles, type RoleSide } from "./effective";
import {
  activityOf,
  compareRoleMetrics,
  roleAdvice,
  sidePositions,
  type Activity,
  type RoleMetricComparison,
  type SidePositions,
} from "./view";

export interface ReportRole {
  role: Role | null;
  sides: { T: Role | null; CT: Role | null };
  /** Roles as detected, before corrections. */
  detected: EffectiveRoles["detected"];
  /** Which side was set by hand: "match" (this match) or "default" (the player's usual role). */
  source: EffectiveRoles["source"];
  /** The uploader's usual role for this player per side (what "automatic" falls back to before detection). */
  usual: { T: Role | null; CT: Role | null };
  comparisons: RoleMetricComparison[];
  /** Up to three metrics the player is worse at than pros of the role. */
  advice: RoleMetricComparison[];
  /** At least one comparison uses norms measured on pros of this role. */
  roleSpecific: boolean;
  /** Where the player stood per side (null for samples stored before S31). */
  positions: Partial<Record<RoleSide, SidePositions>>;
  /** Tempo, involvement and quiet rounds per side. */
  activity: Partial<Record<RoleSide, Activity>>;
}

export async function loadReportRole(
  prisma: PrismaClient,
  { matchId, steamId, map }: { matchId: string; steamId: string; map: string }
): Promise<ReportRole | null> {
  try {
    const [samples, { corrections, defaults }] = await Promise.all([
      loadMatchRole(prisma, matchId, steamId),
      loadRoleCorrections(prisma, matchId),
    ]);
    const all = samples.all;
    if (!all && !samples.CT && !samples.T) return null;
    const eff = resolve(steamId, { T: samples.T?.role ?? null, CT: samples.CT?.role ?? null }, corrections, defaults);
    // A side without its own sample keeps the stored match role.
    const role = eff.source.T || eff.source.CT ? eff.role : (all?.role ?? eff.role);
    const table = role ? await getNormTable(prisma, { pools: ["pro", rolePool(role)], map }) : null;
    const comparisons = role && all ? compareRoleMetrics(role, all.metrics, table, { map }) : [];
    const positions: ReportRole["positions"] = {};
    const activity: ReportRole["activity"] = {};
    for (const side of ["T", "CT"] as const) {
      const pos = sidePositions(samples[side]?.profile);
      const act = activityOf(samples[side]?.profile);
      if (pos) positions[side] = pos;
      if (act) activity[side] = act;
    }
    return {
      role,
      sides: eff.sides,
      detected: eff.detected,
      source: eff.source,
      usual: { T: defaults?.[steamId]?.T ?? null, CT: defaults?.[steamId]?.CT ?? null },
      comparisons,
      advice: roleAdvice(comparisons),
      roleSpecific: comparisons.some((c) => c.roleSpecific),
      positions,
      activity,
    };
  } catch (err) {
    console.error("[report] role unavailable:", err);
    return null;
  }
}
