/**
 * The report's "your role" card (S24): the match role, the role per side,
 * the role's key metrics against pros of that role and the advice that
 * follows. Null when the role can't be read (the report renders without it).
 */
import type { PrismaClient } from "@prisma/client";
import { getNormTable } from "@/lib/norms/persist";
import { rolePool } from "@/lib/norms/norms";
import type { Role } from "./roles";
import { loadMatchRole } from "./persist";
import { compareRoleMetrics, roleAdvice, type RoleMetricComparison } from "./view";

export interface ReportRole {
  role: Role | null;
  sides: { T: Role | null; CT: Role | null };
  comparisons: RoleMetricComparison[];
  /** Up to three metrics the player is worse at than pros of the role. */
  advice: RoleMetricComparison[];
  /** At least one comparison uses norms measured on pros of this role. */
  roleSpecific: boolean;
}

export async function loadReportRole(
  prisma: PrismaClient,
  { matchId, steamId, map }: { matchId: string; steamId: string; map: string }
): Promise<ReportRole | null> {
  try {
    const samples = await loadMatchRole(prisma, matchId, steamId);
    const all = samples.all;
    if (!all && !samples.CT && !samples.T) return null;
    const role = all?.role ?? null;
    const table = role ? await getNormTable(prisma, { pools: ["pro", rolePool(role)], map }) : null;
    const comparisons = role && all ? compareRoleMetrics(role, all.metrics, table, { map }) : [];
    return {
      role,
      sides: { T: samples.T?.role ?? null, CT: samples.CT?.role ?? null },
      comparisons,
      advice: roleAdvice(comparisons),
      roleSpecific: comparisons.some((c) => c.roleSpecific),
    };
  } catch (err) {
    console.error("[report] role unavailable:", err);
    return null;
  }
}
