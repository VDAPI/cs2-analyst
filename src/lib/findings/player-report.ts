/**
 * One player's report of a match from stored data: their findings, the
 * MechanicsStats/AimStats metrics and the ranked report. Shared by the report
 * page and the public report link (S16).
 */
import type { PrismaClient } from "@prisma/client";
import { getMapConfig } from "@/lib/utils/maps";
import { mapDisplayName } from "@/lib/utils/mapNames";
import type { RadarConfig } from "@/lib/canvas/radar";
import { buildReport, playerMetrics, type AimSummary, type PlayerReport, type ReportMetric } from "./report";
import type { FindingView } from "./view";

export async function loadPlayerReport(
  prisma: PrismaClient,
  matchId: string,
  steamId: string,
  allFindings: FindingView[]
): Promise<{
  report: PlayerReport<FindingView>;
  hasData: boolean;
  /** Every metric of the match (the norms compare them all). */
  metrics: ReportMetric[];
  /** Rounds the player played, to put count metrics on the norms' scale. */
  rounds: number;
}> {
  const where = { matchId_steamId: { matchId, steamId } };
  const [mech, aim, tactics, util] = await Promise.all([
    prisma.mechanicsStats.findUnique({ where }),
    prisma.aimStats.findUnique({ where }),
    prisma.tacticsStats.findUnique({ where }),
    prisma.utilityStats.findUnique({ where }),
  ]);
  const mine = allFindings.filter((f) => f.steamId === steamId);
  const metrics = playerMetrics(mech, aim as AimSummary | null, tactics, util);
  const report = buildReport<FindingView>(mine, metrics);
  return {
    report,
    hasData: mech != null || aim != null || tactics != null || util != null,
    metrics,
    rounds: tactics?.rounds ?? 0,
  };
}

/** What the 2D clips on a report need about the match's map. */
export function reportClipContext(
  matchId: string,
  map: string,
  share: string | null = null,
  readOnly: boolean = share != null
) {
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
  return { matchId, mapName: mapDisplayName(map), mapConfig: radar, share, readOnly };
}
