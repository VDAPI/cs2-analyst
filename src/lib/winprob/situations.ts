/**
 * "Co zrobiłby pro" (S14): the player's situation at a mistake, matched
 * against the same situations in pro demos, and what the pros did next.
 *
 * A situation is one alive player at one moment: map, side, players alive
 * on each side, bomb planted, time left, position and HP. Every pro demo
 * stores one row per alive player every SITUATION_STEP_S seconds
 * (`ProSituation`), with the action that player took in the next
 * ACTION_HORIZON_S seconds and how the team's win probability moved over
 * them. The search keeps rows with the same map, side, bomb state and alive
 * counts (widening the counts by one when there are too few), ranks them by
 * position, time and HP, and summarises the nearest ones: how often pros
 * held, pushed, fell back, used utility, planted or defused, and what each
 * did to the round on average. The closest example opens as a 2D clip.
 *
 * Actions describe what the pro did, judged after the fact from positions
 * (closer to / farther from the nearest enemy); they are a description, not
 * a judgement of what the pro could know.
 *
 * Pure module, covered by `npm run test:winprob`.
 */
import { BOMB_TIME_S, otherSide, playersAt, stateAt, type RoundContext, type Side, type Vec3 } from "./features";
import { predictSide, type WinProbModelSpec } from "./model";

export const SITUATIONS_VERSION = 2;
export const SITUATION_STEP_S = 2;
export const ACTION_HORIZON_S = 5;
/** Closing or opening the distance to the nearest enemy by more than this is a push / fall back. */
const ENGAGE_DELTA = 250;
/** Moving less than this is holding. */
const HOLD_MOVE = 200;
/** A grenade detonating this long after the horizon was still thrown inside it. */
const GRENADE_FLIGHT_S = 2;
/** …and at least this long (a grenade popping sooner was thrown before the decision). */
const GRENADE_MIN_FLIGHT_S = 1;

export const PRO_ACTIONS = ["plant", "defuse", "utility", "push", "fall_back", "reposition", "hold"] as const;
export type ProAction = (typeof PRO_ACTIONS)[number];

export interface Situation {
  side: Side;
  aliveUs: number;
  aliveThem: number;
  planted: boolean;
  /** Round clock before the plant, bomb timer after. */
  timeLeft: number;
  x: number;
  y: number;
  z: number;
  hp: number;
}

export interface ActionResult {
  action: ProAction;
  kill: boolean;
  died: boolean;
}

/** One stored pro situation. */
export interface SituationRow extends Situation, ActionResult {
  roundNumber: number;
  tick: number;
  steamId: string;
  /** Team win probability at the moment and ACTION_HORIZON_S later (0–1). */
  wpBefore: number;
  wpAfter: number;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** The player's situation at `tick`, or null when they are not alive there. */
export function situationAt(ctx: RoundContext, steamId: string, tick: number): Situation | null {
  const side = ctx.sideOf.get(steamId);
  if (!side) return null;
  const players = playersAt(ctx, tick);
  const me = players.find((p) => p.steamId === steamId);
  if (!me?.alive || !me.pos) return null;
  const f = stateAt(ctx, tick);
  return {
    side,
    aliveUs: side === "T" ? f.t_alive : f.ct_alive,
    aliveThem: side === "T" ? f.ct_alive : f.t_alive,
    planted: f.planted === 1,
    timeLeft: r1(f.time_left),
    x: Math.round(me.pos.x),
    y: Math.round(me.pos.y),
    z: Math.round(me.pos.z),
    hp: me.health,
  };
}

/** The nearest alive enemy at `tick`: its id and distance. */
function nearestEnemy(ctx: RoundContext, side: Side, tick: number, at: Vec3): { steamId: string; d: number } | null {
  let best: { steamId: string; d: number } | null = null;
  for (const p of playersAt(ctx, tick)) {
    if (p.side !== otherSide(side) || !p.alive || !p.pos) continue;
    const d = dist(p.pos, at);
    if (!best || d < best.d) best = { steamId: p.steamId, d };
  }
  return best;
}

/** Where that enemy was at `tick`, or just before he died if that was earlier. */
function enemyPosAt(ctx: RoundContext, steamId: string, tick: number): Vec3 | null {
  const death = ctx.deathTick.get(steamId);
  const at = death != null && death <= tick ? death - 1 : tick;
  return playersAt(ctx, at).find((p) => p.steamId === steamId)?.pos ?? null;
}

/** What the player did in the next ACTION_HORIZON_S seconds after `tick`. */
export function actionAfter(ctx: RoundContext, steamId: string, tick: number): ActionResult | null {
  const side = ctx.sideOf.get(steamId);
  if (!side) return null;
  const tr = ctx.tickRate;
  const until = tick + ACTION_HORIZON_S * tr;
  const death = ctx.deathTick.get(steamId);
  const died = death != null && death > tick && death <= until;
  const kill = ctx.round.kills.some((k) => k.attackerSteamId === steamId && k.tick > tick && k.tick <= until);
  const result = (action: ProAction): ActionResult => ({ action, kill, died });

  const bombBy = (type: string) =>
    ctx.round.bombs.some((b) => b.type === type && b.playerSteamId === steamId && b.tick > tick && b.tick <= until);
  if (side === "T" && (bombBy("PLANT_BEGIN") || bombBy("PLANTED"))) return result("plant");
  if (side === "CT" && (bombBy("DEFUSE_BEGIN") || bombBy("DEFUSED"))) return result("defuse");
  if (
    ctx.round.grenades.some(
      (g) => g.throwerSteamId === steamId &&
        g.tick > tick + GRENADE_MIN_FLIGHT_S * tr &&
        g.tick <= until + GRENADE_FLIGHT_S * tr
    )
  ) {
    return result("utility");
  }

  const end = died ? death! - 1 : Math.min(until, ctx.round.endTick);
  const now = playersAt(ctx, tick).find((p) => p.steamId === steamId);
  const later = playersAt(ctx, end).find((p) => p.steamId === steamId);
  if (!now?.pos || !later?.pos) return null;
  // Closer to / further from the same enemy (killing him must not read as falling back).
  const enemy = nearestEnemy(ctx, side, tick, now.pos);
  const enemyLater = enemy ? enemyPosAt(ctx, enemy.steamId, end) : null;
  if (enemy && enemyLater) {
    const after = dist(later.pos, enemyLater);
    if (enemy.d - after > ENGAGE_DELTA) return result("push");
    if (after - enemy.d > ENGAGE_DELTA) return result(kill ? "push" : "fall_back");
  }
  return result(dist(now.pos, later.pos) > HOLD_MOVE ? "reposition" : "hold");
}

/** Situation rows of one round of a pro demo (every alive player every SITUATION_STEP_S s). */
export function roundSituations(ctx: RoundContext, model: WinProbModelSpec): SituationRow[] {
  const out: SituationRow[] = [];
  const tr = ctx.tickRate;
  const step = Math.round(SITUATION_STEP_S * tr);
  // Leave out the last seconds: nothing that follows them is a decision any more.
  const last = ctx.decided - ACTION_HORIZON_S * tr;
  for (let tick = ctx.freezeEnd + step; tick <= last; tick += step) {
    const feats = stateAt(ctx, tick);
    const featsLater = stateAt(ctx, Math.min(tick + ACTION_HORIZON_S * tr, ctx.decided - 1));
    for (const [steamId] of ctx.sideOf) {
      const s = situationAt(ctx, steamId, tick);
      if (!s) continue;
      // Bomb about to go off: no decision left to compare.
      if (s.planted && s.timeLeft < BOMB_TIME_S * 0.05) continue;
      const a = actionAfter(ctx, steamId, tick);
      if (!a) continue;
      out.push({
        ...s,
        ...a,
        roundNumber: ctx.round.number,
        tick,
        steamId,
        wpBefore: predictSide(model, feats, s.side),
        wpAfter: predictSide(model, featsLater, s.side),
      });
    }
  }
  return out;
}

// ─── Search ──────────────────────────────────────────────

/** Rows the summary needs from a stored situation. */
export interface Candidate extends Situation {
  id: string;
  action: ProAction;
  kill: boolean;
  died: boolean;
  wpBefore: number;
  wpAfter: number;
}

/** Fewer exact matches than this widens the alive counts by one. */
export const MIN_EXACT = 12;
export const NEIGHBOURS = 25;

/** Distance between two situations; alive-count differences cost a lot, side and bomb state must match. */
export function situationDistance(a: Situation, b: Situation): number {
  if (a.side !== b.side || a.planted !== b.planted) return Infinity;
  const pos = Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 2) / 500;
  const time = (a.timeLeft - b.timeLeft) / (a.planted ? 8 : 20);
  const hp = (a.hp - b.hp) / 60;
  const alive = (Math.abs(a.aliveUs - b.aliveUs) + Math.abs(a.aliveThem - b.aliveThem)) * 1.5;
  return Math.hypot(pos, time, hp) + alive;
}

export interface ActionSummary {
  action: ProAction;
  /** Share of neighbours (weighted), 0–1. */
  share: number;
  n: number;
  /** Average change of the team's win probability over the next seconds, pp. */
  avgDeltaPp: number;
  /** Died within the horizon, share. */
  diedShare: number;
}

export interface SimilarResult {
  n: number;
  exact: boolean;
  actions: ActionSummary[];
  /** The closest neighbours, nearest first. */
  nearest: Array<Candidate & { distance: number }>;
}

export function similarSituations(query: Situation, candidates: Candidate[], k = NEIGHBOURS): SimilarResult {
  const exact = candidates.filter((c) => c.aliveUs === query.aliveUs && c.aliveThem === query.aliveThem);
  const pool = exact.length >= MIN_EXACT ? exact : candidates;
  const ranked = pool
    .map((c) => ({ ...c, distance: situationDistance(query, c) }))
    .filter((c) => Number.isFinite(c.distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
  const weight = (d: number) => 1 / (0.25 + d);
  const total = ranked.reduce((a, c) => a + weight(c.distance), 0);
  const actions: ActionSummary[] = [];
  for (const action of PRO_ACTIONS) {
    const rows = ranked.filter((c) => c.action === action);
    if (rows.length === 0) continue;
    const w = rows.reduce((a, c) => a + weight(c.distance), 0);
    actions.push({
      action,
      share: total > 0 ? Math.round((w / total) * 100) / 100 : 0,
      n: rows.length,
      avgDeltaPp: r1((rows.reduce((a, c) => a + (c.wpAfter - c.wpBefore), 0) / rows.length) * 100),
      diedShare: Math.round((rows.filter((c) => c.died).length / rows.length) * 100) / 100,
    });
  }
  actions.sort((a, b) => b.share - a.share);
  return { n: ranked.length, exact: pool === exact, actions, nearest: ranked.slice(0, 5) };
}
