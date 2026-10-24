/**
 * Loads the admin's callout corrections (MapCallout) and registers them for
 * the map-lanes lookups. Call before building a team breakdown or the
 * callout map, so edits on /callouts show up on the next page load.
 */
import type { PrismaClient } from "@prisma/client";
import { applyOverrides, registerMapLanes, type CalloutOverride, type MapLanes } from "./map-lanes";

export async function loadMapLanes(prisma: PrismaClient, map: string): Promise<{ lanes: MapLanes | null; overrides: CalloutOverride[] }> {
  const overrides = await prisma.mapCallout.findMany({
    where: { map },
    select: { place: true, name: true, ctSpot: true, laneA: true, laneB: true },
  });
  const lanes = applyOverrides(map, overrides);
  registerMapLanes(map, lanes);
  return { lanes, overrides };
}
