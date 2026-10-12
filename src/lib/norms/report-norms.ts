/**
 * Norms for one player's report (S13): every report metric against the pro
 * norm and the player's rank pool. Shared by the report page and the public
 * report link.
 */
import type { PrismaClient } from "@prisma/client";
import type { ReportMetric } from "@/lib/findings/report";
import type { TFunction } from "@/lib/i18n/translate";
import { rankBucket } from "./norms";
import { getNormTable } from "./persist";
import { compareMetric, rankLabel, type MetricComparison } from "./view";

export interface ReportNorms {
  cmpOf: Map<string, MetricComparison>;
  /** Label of the player's rank pool ("Poziom FACEIT 7", or every player when unknown). */
  rankName: string;
  /** Every metric with a value, for the "you vs pro" table. */
  metrics: ReportMetric[];
  anyMeasured: boolean;
  anyReference: boolean;
  t: TFunction;
}

/** Null when the norms can't be read (the report still renders without them). */
export async function loadReportNorms(
  prisma: PrismaClient,
  {
    matchId,
    steamId,
    map,
    metrics,
    rounds,
    t,
  }: { matchId: string; steamId: string; map: string; metrics: ReportMetric[]; rounds: number; t: TFunction }
): Promise<ReportNorms | null> {
  try {
    const player = await prisma.matchPlayer.findUnique({
      where: { matchId_steamId: { matchId, steamId } },
      select: { rankType: true, rankValue: true },
    });
    const rank = player ? rankBucket(player.rankType, player.rankValue) : null;
    const table = await getNormTable(prisma, { pools: ["pro", "all", ...(rank ? [rank] : [])], map });
    const cmpOf = new Map(metrics.map((m) => [m.key, compareMetric(m, table, { map }, rank, rounds)] as const));
    const all = [...cmpOf.values()];
    return {
      cmpOf,
      rankName: rank ? rankLabel(t, rank) : t("norms.rankAll"),
      metrics: metrics.filter((m) => m.value != null),
      anyMeasured: all.some((c) => c.pro?.source === "pro"),
      anyReference: all.some((c) => c.pro?.source === "reference"),
      t,
    };
  } catch (err) {
    console.error("[report] norms unavailable:", err);
    return null;
  }
}
