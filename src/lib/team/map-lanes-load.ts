/**
 * Loads the admin's callout corrections (MapCallout) and drawn zones
 * (MapZone) and registers them for the map-lanes lookups. Call before
 * building a team breakdown or the callout map, so edits on /callouts show
 * up on the next page load.
 */
import type { PrismaClient } from "@prisma/client";
import { applyOverrides, registerMapLanes, type CalloutOverride, type MapLanes } from "./map-lanes";
import { parseZones, type Zone } from "./zones";

export async function loadZones(prisma: PrismaClient, map: string): Promise<Zone[]> {
  const rows = await prisma.mapZone.findMany({
    where: { map },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, points: true, ctSpot: true, laneA: true, laneB: true },
  });
  return parseZones(rows);
}

export async function loadMapLanes(
  prisma: PrismaClient,
  map: string
): Promise<{ lanes: MapLanes | null; overrides: CalloutOverride[]; zones: Zone[] }> {
  const [overrides, zones] = await Promise.all([
    prisma.mapCallout.findMany({
      where: { map },
      select: { place: true, name: true, ctSpot: true, laneA: true, laneB: true },
    }),
    loadZones(prisma, map),
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
  registerMapLanes(map, lanes);
  return { lanes, overrides, zones };
}
