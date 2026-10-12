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
  stateAt,
  WP_FEATURES,
  WP_FEATURES_VERSION,
  type RoundContext,
  type SiteCenters,
  type WpFrame,
  type WpMatch,
} from "./features";
import { FINDING_TYPES, isFindingType } from "@/lib/findings/catalog";
import { findingImpact, type Impact, type ImpactTarget } from "./impact";
import { isModelSpec, predictSide, type WinProbModelSpec } from "./model";
import { PRIOR_MODEL } from "./prior";
import { matchWpa, type PlayerWpa } from "./series";
import {
  ACTION_HORIZON_S,
  actionAfter,
  MIN_EXACT,
  NEIGHBOURS,
  roundSituations,
  similarSituations,
  situationAt,
  SITUATIONS_VERSION,
  type ActionResult,
  type Candidate,
  type ProAction,
  type SimilarResult,
  type Situation,
} from "./situations";

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
  /** Matches the model was trained on (0 for the prior). */
  nMatches: number;
}

const MODEL_TTL_MS = 60_000;
let modelCache: { at: number; model: ActiveModel } | null = null;

export const PRIOR: ActiveModel = { id: "prior", kind: "prior", spec: PRIOR_MODEL, trained: false, nMatches: 0 };

/** The newest active trained model for the current features, or the prior. Cached for a minute. */
export async function getActiveModel(prisma: PrismaClient): Promise<ActiveModel> {
  if (modelCache && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.model;
  let model = PRIOR;
  try {
    const row = await prisma.winProbModel.findFirst({
      where: { active: true, featuresVersion: WP_FEATURES_VERSION },
      orderBy: { createdAt: "desc" },
      select: { id: true, kind: true, spec: true, nMatches: true },
    });
    if (row && isModelSpec(row.spec)) {
      model = { id: row.id, kind: row.kind, spec: row.spec, trained: true, nMatches: row.nMatches };
    }
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
        modelId: model.id,
      })),
    }),
  ]);
}

/**
 * Snapshots for analysed matches that have none of the current version, and
 * situations for pro demos that have none (or older ones, or ones scored by
 * another model). The parse worker
 * runs this on startup. Returns how many matches were processed.
 */
export async function backfillWinProb(
  prisma: PrismaClient,
  { limit = 500, log }: { limit?: number; log?: (line: string) => void } = {}
): Promise<number> {
  const model = await getActiveModel(prisma);
  const matches = await prisma.match.findMany({
    where: {
      upload: { status: "COMPLETED", deletedAt: null },
      rounds: { some: { ticks: { isNot: null } } },
      OR: [
        { winProbData: null },
        { winProbData: { version: { not: WP_FEATURES_VERSION } } },
        { upload: { pro: true }, situations: { none: {} } },
        { upload: { pro: true }, situations: { some: { version: { not: SITUATIONS_VERSION } } } },
        // Pro situations scored by an older model: rescored so they compare with the player's numbers.
        { upload: { pro: true }, situations: { some: { modelId: { not: model.id } } } },
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

// ─── WPA ─────────────────────────────────────────────────

const WPA_TTL_MS = 10 * 60_000;
const wpaCache = new Map<string, { at: number; rows: PlayerWpa[] }>();

/** Win probability added per player over the match (cached per match and model for a few minutes). */
export async function getMatchWpa(prisma: PrismaClient, matchId: string): Promise<PlayerWpa[]> {
  const model = await getActiveModel(prisma);
  const key = `${matchId}:${model.id}`;
  const hit = wpaCache.get(key);
  if (hit && Date.now() - hit.at < WPA_TTL_MS) return hit.rows;
  const match = await loadWinProbMatch(prisma, matchId);
  const rows = match ? matchWpa(match, model.spec) : [];
  if (wpaCache.size > 200) wpaCache.clear();
  wpaCache.set(key, { at: Date.now(), rows });
  return rows;
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

// ─── Co zrobiłby pro ─────────────────────────────────────

/** Most candidates read per search; the index narrows them to one map, side, bomb state and ±1 alive. */
const MAX_CANDIDATES = 6000;
/** Candidates within this many seconds of round clock are fetched first. */
const TIME_WINDOW_S = 25;

export interface ProExample {
  matchId: string;
  label: string;
  roundNumber: number;
  tick: number;
  steamId: string;
  name: string;
  action: ProAction;
  deltaPp: number;
  died: boolean;
  kill: boolean;
}

export interface ProAdvice {
  /** The player's situation at the decision point (a few seconds before the mistake). */
  situation: Situation;
  decisionTick: number;
  /** What the player did from there. */
  you: ActionResult | null;
  /** Your team's win probability then and ACTION_HORIZON_S later. */
  youDeltaPp: number | null;
  result: Omit<SimilarResult, "nearest">;
  examples: ProExample[];
  /** Pro demos on this map with situations. */
  proMatches: number;
}

/**
 * "Co zrobiłby pro" for one stored finding, or null when the moment cannot be
 * rebuilt (no replay data, the player was not alive at the decision point).
 * `result.n` is 0 when there are no pro demos of the map yet.
 */
export async function proAdviceForFinding(
  prisma: PrismaClient,
  finding: { matchId: string; type: string; steamId: string; roundNumber: number; tick: number }
): Promise<ProAdvice | null> {
  const match = await loadWinProbMatch(prisma, finding.matchId, { rounds: [finding.roundNumber] });
  const round = match?.rounds[0];
  if (!match || !round || round.frames.length === 0) return null;
  const ctx = buildRoundContext(round, match.tickRate, match.sites);
  const before = isFindingType(finding.type) ? FINDING_TYPES[finding.type].clip.before : 3;
  // The decision is made before the mistake shows: the start of the finding's clip.
  let decisionTick = Math.max(ctx.freezeEnd, finding.tick - Math.round(before * match.tickRate));
  let situation = situationAt(ctx, finding.steamId, decisionTick);
  for (let back = 1; !situation && back <= 3; back++) {
    decisionTick = Math.max(ctx.freezeEnd, finding.tick - back * match.tickRate);
    situation = situationAt(ctx, finding.steamId, decisionTick);
  }
  if (!situation) return null;

  const model = await getActiveModel(prisma);
  const you = actionAfter(ctx, finding.steamId, decisionTick);
  const later = Math.min(decisionTick + ACTION_HORIZON_S * match.tickRate, ctx.decided - 1);
  const youDeltaPp =
    later > decisionTick
      ? Math.round(
          (predictSide(model.spec, stateAt(ctx, later), situation.side) -
            predictSide(model.spec, stateAt(ctx, decisionTick), situation.side)) *
            1000
        ) / 10
      : null;

  // Exact alive counts first, ±1 only when there are too few; each within a
  // time window first, so the cap keeps the most similar rows, not arbitrary ones.
  const base = {
    map: match.map,
    version: SITUATIONS_VERSION,
    side: situation.side,
    planted: situation.planted,
    // Never compare a pro demo with itself.
    matchId: { not: finding.matchId },
  };
  const fetchRows = async (band: number, windowed: boolean) =>
    prisma.proSituation.findMany({
      where: {
        ...base,
        aliveUs: { gte: situation.aliveUs - band, lte: situation.aliveUs + band },
        aliveThem: { gte: situation.aliveThem - band, lte: situation.aliveThem + band },
        ...(windowed
          ? { timeLeft: { gte: situation.timeLeft - TIME_WINDOW_S, lte: situation.timeLeft + TIME_WINDOW_S } }
          : {}),
      },
      orderBy: { id: "asc" },
      take: MAX_CANDIDATES,
    });
  let rows = await fetchRows(0, true);
  if (rows.length < NEIGHBOURS) rows = await fetchRows(0, false);
  if (rows.length < MIN_EXACT) {
    rows = await fetchRows(1, true);
    if (rows.length < NEIGHBOURS) rows = await fetchRows(1, false);
  }
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    side: r.side === "T" ? "T" : "CT",
    aliveUs: r.aliveUs,
    aliveThem: r.aliveThem,
    planted: r.planted,
    timeLeft: r.timeLeft,
    x: r.x,
    y: r.y,
    z: r.z,
    hp: r.hp,
    action: r.action as ProAction,
    kill: r.kill,
    died: r.died,
    wpBefore: r.wpBefore,
    wpAfter: r.wpAfter,
  }));
  const { nearest, ...result } = similarSituations(situation, candidates);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const near = nearest.map((n) => byId.get(n.id)!).filter(Boolean);
  const matchIds = [...new Set(near.map((r) => r.matchId))];
  const [uploads, players, proMatches] = await Promise.all([
    prisma.demoUpload.findMany({ where: { matchId: { in: matchIds } }, select: { matchId: true, proLabel: true, fileName: true } }),
    prisma.matchPlayer.findMany({
      where: { matchId: { in: matchIds }, steamId: { in: near.map((r) => r.steamId) } },
      select: { matchId: true, steamId: true, name: true },
    }),
    prisma.winProbData.count({ where: { map: match.map, pro: true } }),
  ]);
  const labelOf = new Map(uploads.map((u) => [u.matchId, u.proLabel || u.fileName.replace(/\.dem(\.bz2)?$/i, "")]));
  const nameOf = new Map(players.map((p) => [`${p.matchId}:${p.steamId}`, p.name]));
  const examples: ProExample[] = near.map((r) => ({
    matchId: r.matchId,
    label: labelOf.get(r.matchId) ?? "",
    roundNumber: r.roundNumber,
    tick: r.tick,
    steamId: r.steamId,
    name: nameOf.get(`${r.matchId}:${r.steamId}`) ?? "",
    action: r.action as ProAction,
    deltaPp: Math.round((r.wpAfter - r.wpBefore) * 1000) / 10,
    died: r.died,
    kill: r.kill,
  }));
  return { situation, decisionTick, you, youDeltaPp, result, examples, proMatches };
}
