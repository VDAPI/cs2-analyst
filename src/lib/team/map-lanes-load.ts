/**
 * Loads the admin's callout corrections (MapCallout) and drawn zones
 * (MapZone), with a team's own changes on top (TeamMapZone), and registers
 * them for the map-lanes lookups. Call before building a team breakdown or
 * the callout map, so edits on /callouts show up on the next page load.
 */
import type { PrismaClient } from "@prisma/client";
import { applyOverrides, lanesKey, registerMapLanes, type CalloutOverride, type MapLanes } from "./map-lanes";
import { mergeTeamZones, parseZones, type Zone } from "./zones";

/** The team whose positions a user's analyses use: their first one. */
export async function positionsTeamId(prisma: PrismaClient, userId: string): Promise<string | undefined> {
  const member = await prisma.teamMember.findFirst({ where: { userId }, orderBy: { joinedAt: "asc" }, select: { teamId: true } });
  return member?.teamId;
}

const ZONE_SELECT = { id: true, name: true, points: true, ctSpot: true, laneA: true, laneB: true, level: true } as const;

/** A team's rows on a map: own zones, versions of shared ones and hidden ones. */
export async function loadTeamZones(prisma: PrismaClient, map: string, teamId: string) {
  const rows = await prisma.teamMapZone.findMany({
    where: { map, teamId },
    orderBy: { createdAt: "asc" },
    select: { ...ZONE_SELECT, replacesZoneId: true, hidden: true },
  });
  const flags = new Map(rows.map((r) => [r.id, r]));
  return parseZones(rows).map((z) => ({ ...z, replacesZoneId: flags.get(z.id)!.replacesZoneId, hidden: flags.get(z.id)!.hidden }));
}

export async function loadZones(prisma: PrismaClient, map: string, teamId?: string): Promise<Zone[]> {
  const [rows, own] = await Promise.all([
    prisma.mapZone.findMany({ where: { map }, orderBy: { createdAt: "asc" }, select: ZONE_SELECT }),
    teamId ? loadTeamZones(prisma, map, teamId) : Promise.resolve([]),
  ]);
  return mergeTeamZones(parseZones(rows), own);
}

export async function loadMapLanes(
  prisma: PrismaClient,
  map: string,
  teamId?: string
): Promise<{ lanes: MapLanes | null; overrides: CalloutOverride[]; zones: Zone[] }> {
  const [overrides, zones] = await Promise.all([
    prisma.mapCallout.findMany({
      where: { map },
      select: { place: true, name: true, ctSpot: true, laneA: true, laneB: true },
    }),
    loadZones(prisma, map, teamId),
  ]);
  // A zone is one more callout: its name, CT position and lanes.
  const fromZones: CalloutOverride[] = zones.map((z) => ({
    place: z.name,
    name: z.name,
    ctSpot: z.ctSpot,
    laneA: z.laneA,
    laneB: z.laneB,
  }));
  const lanes = applyOverrides(map, [...overrides, ...fromZones]);
  registerMapLanes(lanesKey(map, teamId), lanes);
  return { lanes, overrides, zones };
}
