/**
 * Norms in the DB (S13): NormSample rows per match (built by build.ts from
 * the same stored inputs the analyses use) and MetricNorm percentiles rebuilt
 * from them. The parse pipeline stores a match's samples right after its
 * findings; the pro pool is refreshed at once after a pro demo, the rank
 * pools at most every NORMS_REFRESH_MS.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { loadMechanicsInput } from "@/lib/analysis/persist-mechanics";
import { loadAimInput } from "@/lib/analysis/persist-aim";
import { loadTacticsInput } from "@/lib/analysis/persist-tactics";
import { loadUtilityInput } from "@/lib/analysis/persist-utility";
import { MECHANICS_VERSION } from "@/lib/analysis/movement";
import { AIM_VERSION } from "@/lib/analysis/aim";
import { TACTICS_VERSION } from "@/lib/analysis/tactics";
import { UTILITY_VERSION } from "@/lib/analysis/utility";
import { buildNormSamples } from "./build";
import {
  aggregateNorms,
  NORMS_VERSION,
  NormTable,
  rankBucket,
  type NormRow,
  type NormSampleInput,
  type NormSide,
  type SampleMetrics,
  type Situation,
} from "./norms";

/** Samples are valid while sampling and the analyses behind them are unchanged. */
export const NORMS_STAMP = `n${NORMS_VERSION}.m${MECHANICS_VERSION}.a${AIM_VERSION}.t${TACTICS_VERSION}.u${UTILITY_VERSION}`;

/** Rank pools change slowly; rebuild them at most this often from the parse worker. */
export const NORMS_REFRESH_MS = 30 * 60 * 1000;
const REFRESHED_KEY = "norms:refreshedAt";

/**
 * Store the match's norm samples (replacing older ones). Returns how many rows
 * were stored. `pro` must come from the caller during the parse: the upload is
 * only linked to its match when the analysis completes.
 */
export async function computeAndPersistNormSamples(
  prisma: PrismaClient,
  matchId: string,
  opts: { pro?: boolean } = {}
): Promise<number> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      map: true,
      upload: { select: { pro: true } },
      players: { select: { steamId: true, team: true, rankType: true, rankValue: true } },
    },
  });
  if (!match) return 0;
  const [mechanics, aim, tactics, utility] = await Promise.all([
    loadMechanicsInput(prisma, matchId),
    loadAimInput(prisma, matchId),
    loadTacticsInput(prisma, matchId),
    loadUtilityInput(prisma, matchId),
  ]);
  const samples = buildNormSamples({
    map: match.map,
    pro: opts.pro ?? match.upload?.pro ?? false,
    players: match.players.map((p) => ({ steamId: p.steamId, team: p.team, rank: rankBucket(p.rankType, p.rankValue) })),
    mechanics,
    aim,
    tactics,
    utility,
  });
  await prisma.$transaction([
    prisma.normSample.deleteMany({ where: { matchId } }),
    prisma.normSample.createMany({
      data: samples.map((s) => ({
        matchId,
        steamId: s.steamId,
        side: s.side,
        map: s.map,
        pro: s.pro,
        version: NORMS_STAMP,
        metrics: s.metrics as unknown as Prisma.InputJsonValue,
      })),
    }),
  ]);
  return samples.length;
}

const PAGE = 2000;

type SampleReader = Pick<PrismaClient, "normSample" | "matchPlayer" | "match">;

/**
 * Every current sample, with the player's rank looked up from MatchPlayer (it
 * can arrive after sampling). The same demo uploaded twice (two teammates, a
 * retried pro upload) is one match: samples are kept once per demo
 * fingerprint, player, side and pool.
 */
async function loadSamples(db: SampleReader): Promise<NormSampleInput[]> {
  const out: NormSampleInput[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.normSample.findMany({
      where: { version: NORMS_STAMP },
      select: { id: true, matchId: true, steamId: true, side: true, map: true, pro: true, metrics: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    const matchIds = [...new Set(rows.map((r) => r.matchId))];
    const [ranks, matches] = await Promise.all([
      db.matchPlayer.findMany({
        where: { matchId: { in: matchIds }, rankType: { not: null } },
        select: { matchId: true, steamId: true, rankType: true, rankValue: true },
      }),
      db.match.findMany({
        where: { id: { in: matchIds } },
        select: { id: true, map: true, totalTicks: true, scoreCT: true, scoreT: true },
      }),
    ]);
    const rankOf = new Map(ranks.map((r) => [`${r.matchId}:${r.steamId}`, rankBucket(r.rankType, r.rankValue)]));
    const demoOf = new Map(matches.map((m) => [m.id, `${m.map}|${m.totalTicks}|${m.scoreCT}|${m.scoreT}`]));
    for (const r of rows) {
      const key = `${demoOf.get(r.matchId) ?? r.matchId}|${r.steamId}|${r.side}|${r.pro}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        map: r.map,
        side: r.side as NormSide,
        pro: r.pro,
        rank: r.pro ? null : (rankOf.get(`${r.matchId}:${r.steamId}`) ?? null),
        metrics: r.metrics as unknown as SampleMetrics,
      });
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }
  return out;
}

/**
 * Rebuild every MetricNorm from the samples. Returns the number of cells
 * stored. The samples are read under the lock, so a slower refresh can never
 * replace newer norms with an older snapshot.
 */
export async function refreshNorms(prisma: PrismaClient): Promise<number> {
  let cells = 0;
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('norms:refresh'))`;
      const rows = aggregateNorms(await loadSamples(tx));
      cells = rows.length;
      await tx.metricNorm.deleteMany({});
      for (let i = 0; i < rows.length; i += PAGE) {
        await tx.metricNorm.createMany({ data: rows.slice(i, i + PAGE) });
      }
      const value = new Date().toISOString();
      await tx.appSetting.upsert({
        where: { key: REFRESHED_KEY },
        create: { key: REFRESHED_KEY, value },
        update: { value },
      });
    },
    { timeout: 300_000, maxWait: 60_000 }
  );
  tableCache.clear();
  return cells;
}

export async function normsRefreshedAt(prisma: PrismaClient): Promise<Date | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: REFRESHED_KEY } });
  const at = row ? new Date(row.value) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/** Refresh when the last refresh is older than `maxAgeMs` (or never ran). Returns whether it ran. */
export async function refreshNormsIfStale(prisma: PrismaClient, maxAgeMs = NORMS_REFRESH_MS): Promise<boolean> {
  const at = await normsRefreshedAt(prisma);
  if (at && Date.now() - at.getTime() < maxAgeMs) return false;
  await refreshNorms(prisma);
  return true;
}

// ─── Reading ─────────────────────────────────────────────

const TABLE_TTL_MS = 60_000;
const tableCache = new Map<string, { at: number; table: NormTable }>();

/**
 * The norms a screen needs: the given pools for one map (plus all maps).
 * Cached in-process for a minute; a refresh clears it.
 */
export async function getNormTable(
  prisma: PrismaClient,
  { pools, map }: { pools: string[]; map?: string }
): Promise<NormTable> {
  const maps = map && map !== "all" ? [map, "all"] : ["all"];
  const key = `${[...pools].sort().join(",")}|${maps.join(",")}`;
  const hit = tableCache.get(key);
  if (hit && Date.now() - hit.at < TABLE_TTL_MS) return hit.table;
  const rows = await prisma.metricNorm.findMany({ where: { pool: { in: pools }, map: { in: maps } } });
  const table = new NormTable(
    rows.map(
      (r): NormRow => ({
        pool: r.pool,
        map: r.map,
        side: r.side as NormSide,
        situation: r.situation as Situation,
        metric: r.metric,
        n: r.n,
        p10: r.p10,
        p25: r.p25,
        p50: r.p50,
        p75: r.p75,
        p90: r.p90,
        mean: r.mean,
      })
    )
  );
  tableCache.set(key, { at: Date.now(), table });
  return table;
}

/** How many pro demos and pro player-matches the norms are built on. */
export async function proPoolSize(prisma: PrismaClient): Promise<{ matches: number; players: number }> {
  const [matches, players] = await Promise.all([
    prisma.demoUpload.count({ where: { pro: true, status: "COMPLETED", deletedAt: null } }),
    prisma.normSample.count({ where: { pro: true, side: "all", version: NORMS_STAMP } }),
  ]);
  return { matches, players };
}

// ─── Backfill ────────────────────────────────────────────

/**
 * Store samples for analysed matches that have none (or older ones), newest
 * first. The parse worker runs this on startup so norms cover matches
 * analysed before S13. Returns how many matches were sampled.
 */
export async function backfillNormSamples(
  prisma: PrismaClient,
  { limit = 500, log }: { limit?: number; log?: (line: string) => void } = {}
): Promise<number> {
  const matches = await prisma.match.findMany({
    where: {
      upload: { status: "COMPLETED", deletedAt: null },
      NOT: { normSamples: { some: { version: NORMS_STAMP } } },
      rounds: { some: { ticks: { isNot: null } } },
    },
    select: { id: true },
    orderBy: { date: "desc" },
    take: limit,
  });
  let done = 0;
  for (const m of matches) {
    try {
      await computeAndPersistNormSamples(prisma, m.id);
      done++;
    } catch (err) {
      log?.(` match=${m.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return done;
}
