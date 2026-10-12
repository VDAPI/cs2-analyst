/**
 * Round win probability in the DB (S14): loading a match's rounds for the
 * pure modules, storing training snapshots (WinProbData) and pro situations
 * (ProSituation), picking the model to score with, and the impact of
 * findings. The parse pipeline calls computeAndPersistWinProb() after the
 * findings; the parse worker backfills older matches on startup.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { decodeRoundTicks } from "@/lib/replay/round-ticks";
import { PLACE_CELL } from "@/lib/analysis/places";
import {
  buildRoundContext,
  matchSnapshots,
  siteCenters,
  WP_FEATURES,
  WP_FEATURES_VERSION,
  type RoundContext,
  type SiteCenters,
  type WpFrame,
  type WpMatch,
} from "./features";
import { findingImpact, type Impact, type ImpactTarget } from "./impact";
import { isModelSpec, type WinProbModelSpec } from "./model";
import { PRIOR_MODEL } from "./prior";
import { roundSituations, SITUATIONS_VERSION } from "./situations";

// ─── Loading ─────────────────────────────────────────────

const SITES_TTL_MS = 10 * 60_000;
const sitesCache = new Map<string, { at: number; sites: SiteCenters }>();

/** Bombsite centres of a map, from its callouts and past plants. Cached for a few minutes. */
export async function getSiteCenters(prisma: PrismaClient, map: string): Promise<SiteCenters> {
  const hit = sitesCache.get(map);
  if (hit && Date.now() - hit.at < SITES_TTL_MS) return hit.sites;
  const [cells, plants] = await Promise.all([
    prisma.mapPlaceCell.findMany({
      where: { map, place: { in: ["BombsiteA", "BombsiteB"] } },
      select: { cx: true, cy: true, cz: true, place: true, count: true },
    }),
    prisma.bombEvent.findMany({
      where: { type: "PLANTED", round: { match: { map } } },
      select: { site: true, posX: true, posY: true, posZ: true },
      take: 500,
      orderBy: { tick: "desc" },
    }),
  ]);
  const centre = (c: number) => (c + 0.5) * PLACE_CELL;
  const sites = siteCenters(
    cells.map((c) => ({ place: c.place, x: centre(c.cx), y: centre(c.cy), z: centre(c.cz), count: c.count })),
    plants.map((p) => ({ site: p.site, x: p.posX, y: p.posY, z: p.posZ }))
  );
  sitesCache.set(map, { at: Date.now(), sites });
  return sites;
}

/** A match's rounds as the win-probability modules read them; `rounds` limits which rounds get frames decoded. */
export async function loadWinProbMatch(
  prisma: PrismaClient,
  matchId: string,
  opts: { rounds?: number[] } = {}
): Promise<(WpMatch & { map: string; pro: boolean }) | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      map: true,
      tickRate: true,
      upload: { select: { pro: true } },
      rounds: {
        where: opts.rounds ? { number: { in: opts.rounds } } : undefined,
        orderBy: { number: "asc" },
        select: {
          number: true,
          startTick: true,
          endTick: true,
          winner: true,
          winReason: true,
          ticks: true,
          kills: { select: { tick: true, attackerSteamId: true, victimSteamId: true } },
          bombs: {
            select: { tick: true, type: true, playerSteamId: true, posX: true, posY: true, posZ: true, site: true },
          },
          grenades: { select: { tick: true, throwerSteamId: true } },
          players: { select: { steamId: true, equipValue: true } },
        },
      },
    },
  });
  if (!match) return null;
  const sites = await getSiteCenters(prisma, match.map);
  return {
    map: match.map,
    pro: match.upload?.pro ?? false,
    tickRate: match.tickRate,
    sites,
    rounds: match.rounds.map((r) => ({
      number: r.number,
      startTick: r.startTick,
      endTick: r.endTick,
      winner: r.winner === "T" ? "T" : "CT",
      winReason: r.winReason,
      frames: r.ticks ? (decodeRoundTicks(r.ticks) as WpFrame[]) : [],
      kills: r.kills,
      bombs: r.bombs,
      grenades: r.grenades,
      equip: Object.fromEntries(r.players.map((p) => [p.steamId, p.equipValue])),
    })),
  };
}

// ─── Model ───────────────────────────────────────────────

export interface ActiveModel {
  /** WinProbModel id, or "prior". */
  id: string;
  kind: string;
  spec: WinProbModelSpec;
  trained: boolean;
}

const MODEL_TTL_MS = 60_000;
let modelCache: { at: number; model: ActiveModel } | null = null;

export const PRIOR: ActiveModel = { id: "prior", kind: "prior", spec: PRIOR_MODEL, trained: false };

/** The newest active trained model for the current features, or the prior. Cached for a minute. */
export async function getActiveModel(prisma: PrismaClient): Promise<ActiveModel> {
  if (modelCache && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.model;
  let model = PRIOR;
  try {
    const row = await prisma.winProbModel.findFirst({
      where: { active: true, featuresVersion: WP_FEATURES_VERSION },
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, spec: true },
    });
    if (row && isModelSpec(row.spec)) model = { id: row.id, kind: row.kind, spec: row.spec, trained: true };
  } catch (error) {
    console.error("[winprob] reading the model failed, using the prior:", error);
  }
  modelCache = { at: Date.now(), model };
  return model;
}

export function clearModelCache() {
  modelCache = null;
}

// ─── Snapshots and situations ────────────────────────────

/**
 * Store the match's training snapshots (and, for a pro demo, its situations).
 * Returns the number of snapshots, 0 when no round has replay data.
 */
export async function computeAndPersistWinProb(prisma: PrismaClient, matchId: string): Promise<number> {
  const match = await loadWinProbMatch(prisma, matchId);
  if (!match) return 0;
  const snaps = matchSnapshots(match);
  const rounds = new Set(snaps.map((s) => s.roundNumber)).size;
  const rows = snaps.map((s) => [
    s.roundNumber,
    s.tick,
    s.tWin,
    ...s.features.map((v) => (Number.isFinite(v) ? v : null)),
  ]);
  const data = {
    version: WP_FEATURES_VERSION,
    map: match.map,
    pro: match.pro,
    rounds,
    features: [...WP_FEATURES] as unknown as Prisma.InputJsonValue,
    rows: rows as unknown as Prisma.InputJsonValue,
  };
  await prisma.winProbData.upsert({ where: { matchId }, create: { matchId, ...data }, update: data });
  if (match.pro) await persistSituations(prisma, matchId, match);
  return snaps.length;
}

async function persistSituations(prisma: PrismaClient, matchId: string, match: WpMatch & { map: string }) {
  const model = await getActiveModel(prisma);
  const rows = match.rounds.flatMap((r) => {
    const ctx = buildRoundContext(r, match.tickRate, match.sites);
    return ctx.frames.length > 0 ? roundSituations(ctx, model.spec) : [];
  });
  await prisma.$transaction([
    prisma.proSituation.deleteMany({ where: { matchId } }),
    prisma.proSituation.createMany({
      data: rows.map((s) => ({
        matchId,
        version: SITUATIONS_VERSION,
        map: match.map,
        roundNumber: s.roundNumber,
        tick: s.tick,
        steamId: s.steamId,
        side: s.side,
        aliveUs: s.aliveUs,
        aliveThem: s.aliveThem,
        planted: s.planted,
        timeLeft: s.timeLeft,
        x: s.x,
        y: s.y,
        z: s.z,
        hp: Math.round(s.hp),
        action: s.action,
        kill: s.kill,
        died: s.died,
        wpBefore: s.wpBefore,
        wpAfter: s.wpAfter,
      })),
    }),
  ]);
}

/**
 * Snapshots for analysed matches that have none of the current version, and
 * situations for pro demos that have none (or older ones). The parse worker
 * runs this on startup. Returns how many matches were processed.
 */
export async function backfillWinProb(
  prisma: PrismaClient,
  { limit = 500, log }: { limit?: number; log?: (line: string) => void } = {}
): Promise<number> {
  const matches = await prisma.match.findMany({
    where: {
      upload: { status: "COMPLETED", deletedAt: null },
      rounds: { some: { ticks: { isNot: null } } },
      OR: [
        { winProbData: null },
        { winProbData: { version: { not: WP_FEATURES_VERSION } } },
        { upload: { pro: true }, situations: { none: {} } },
        { upload: { pro: true }, situations: { some: { version: { not: SITUATIONS_VERSION } } } },
      ],
    },
    select: { id: true },
    orderBy: { date: "desc" },
    take: limit,
  });
  let done = 0;
  for (const m of matches) {
    try {
      await computeAndPersistWinProb(prisma, m.id);
      done++;
    } catch (err) {
      log?.(` match=${m.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return done;
}

// ─── Findings impact ─────────────────────────────────────

/**
 * Impact of each target (findings of one match), same order; null where the
 * type has no rule or its round has no replay data. Never throws: a failure
 * only loses the numbers.
 */
export async function findingImpacts(
  prisma: PrismaClient,
  matchId: string,
  targets: ImpactTarget[],
  model: ActiveModel
): Promise<Array<Impact | null>> {
  if (targets.length === 0) return [];
  try {
    const rounds = [...new Set(targets.map((t) => t.roundNumber))];
    const match = await loadWinProbMatch(prisma, matchId, { rounds });
    if (!match) return targets.map(() => null);
    const ctxs = new Map<number, RoundContext>(
      match.rounds.map((r) => [r.number, buildRoundContext(r, match.tickRate, match.sites)])
    );
    return targets.map((t) => {
      try {
        return findingImpact(t, ctxs.get(t.roundNumber), model.spec);
      } catch {
        return null;
      }
    });
  } catch (error) {
    console.error(`[winprob] impacts failed match=${matchId}:`, error);
    return targets.map(() => null);
  }
}
