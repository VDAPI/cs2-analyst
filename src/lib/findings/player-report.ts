/**
 * One player's report of a match from stored data: their findings, the
 * MechanicsStats/AimStats metrics and the ranked report. Shared by the report
 * page and the public report link (S16).
 */
import type { PrismaClient } from "@prisma/client";
import { getMapConfig } from "@/lib/utils/maps";
import { mapDisplayName } from "@/lib/utils/mapNames";
import type { RadarConfig } from "@/lib/canvas/radar";
import { buildReport, playerMetrics, type AimSummary, type PlayerReport } from "./report";
import type { FindingView } from "./view";

export async function loadPlayerReport(
  prisma: PrismaClient,
  matchId: string,
  steamId: string,
  allFindings: FindingView[]
): Promise<{ report: PlayerReport<FindingView>; hasData: boolean }> {
  const [mech, aim] = await Promise.all([
    prisma.mechanicsStats.findUnique({ where: { matchId_steamId: { matchId, steamId } } }),
    prisma.aimStats.findUnique({ where: { matchId_steamId: { matchId, steamId } } }),
  ]);
  const mine = allFindings.filter((f) => f.steamId === steamId);
  const report = buildReport<FindingView>(mine, playerMetrics(mech, aim as AimSummary | null));
  return { report, hasData: mech != null || aim != null };
}

/** What the 2D clips on a report need about the match's map. */
export function reportClipContext(matchId: string, map: string, share: string | null = null) {
  const mapConfig = getMapConfig(map);
  const radar: RadarConfig | null = mapConfig
    ? {
        posX: mapConfig.posX,
        posY: mapConfig.posY,
        scale: mapConfig.scale,
        width: mapConfig.width,
        height: mapConfig.height,
        radarImage: mapConfig.radarImage,
      }
    : null;
  return { matchId, mapName: mapDisplayName(map), mapConfig: radar, share };
}
