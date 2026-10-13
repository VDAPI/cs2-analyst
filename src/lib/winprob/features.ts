/**
 * Round state → model features for the round win-probability model (S14).
 *
 * A round is replayed from the data already in the DB: sampled frames
 * (RoundTicks: positions, HP, armour, alive, active weapon), kills, bomb
 * events, grenade detonations and the money/equipment at freeze end
 * (RoundPlayer). `roundStates()` builds the training snapshots (every
 * SNAPSHOT_STEP_S seconds of live round time plus one right after every kill
 * and the plant); `stateAt()` builds one snapshot at any tick, optionally with
 * a counterfactual (a player who did not die, an enemy who did, extra
 * equipment), which is how a decision's impact is measured.
 *
 * Features are absolute per side (P(T wins) is the target; the model learns
 * the CT/T asymmetry), map-agnostic, and NaN where a feature does not apply
 * (bomb distances before the plant). Trees handle NaN natively; the prior
 * and the logistic model fill it (model.ts).
 *
 * Pure module (no DB), covered by `npm run test:winprob`. Changing a feature
 * or the snapshot rules means bumping WP_FEATURES_VERSION: stored snapshot
 * sets are rebuilt and models trained on older ones stop being used.
 */
import { normalizeWeapon } from "@/lib/analysis/movement";

export const WP_FEATURES_VERSION = 3;

/** CS2 round clock after freeze time, seconds. */
export const ROUND_TIME_S = 115;
/** CS2 bomb timer, seconds. */
export const BOMB_TIME_S = 40;
/** Training snapshots: one every this many seconds of live round time. */
export const SNAPSHOT_STEP_S = 1;
/** Running speed with a rifle, u/s: how fast CTs reach the bomb. */
const RETAKE_SPEED = 220;
/** Defuse time assumed when the kit is unknown (5 s with, 10 s without). */
const DEFUSE_ASSUMED_S = 7.5;
/** A defuse begun this recently by a CT who is still alive is in progress (a kit defuse takes 5 s). */
const DEFUSE_WINDOW_S = 10;

export const WP_FEATURES = [
  "t_alive",
  "ct_alive",
  "alive_diff",
  "alive_log_ratio",
  "t_hp",
  "ct_hp",
  "t_armor",
  "ct_armor",
  "t_equip",
  "ct_equip",
  "equip_avg_diff",
  "t_rifles",
  "ct_rifles",
  "t_awps",
  "ct_awps",
  "time_left",
  "planted",
  "time_pressure",
  "defuse_margin",
  "defuse_short",
  "defusing",
  "ct_bomb_dist",
  "t_bomb_dist",
  "t_site_dist",
  "ct_site_dist",
  "t_util_used",
  "ct_util_used",
] as const;

export type WpFeature = (typeof WP_FEATURES)[number];
export type WpFeatures = Record<WpFeature, number>;

export type Side = "CT" | "T";
export const otherSide = (s: Side): Side => (s === "CT" ? "T" : "CT");

// ─── Inputs ──────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface WpFramePlayer {
  steamId: string;
  team: Side;
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  health: number;
  armor: number;
  isAlive: boolean;
  weapon: string;
}

export interface WpFrame {
  tick: number;
  players: WpFramePlayer[];
}

export interface WpKill {
  tick: number;
  attackerSteamId: string;
  victimSteamId: string;
}

export interface WpBomb {
  tick: number;
  type: string;
  playerSteamId: string;
  posX: number;
  posY: number;
  posZ: number;
  site: string | null;
}

export interface WpGrenade {
  tick: number;
  throwerSteamId: string;
}

export interface WpRound {
  number: number;
  startTick: number;
  endTick: number;
  winner: Side;
  winReason: string;
  frames: WpFrame[];
  kills: WpKill[];
  bombs: WpBomb[];
  grenades: WpGrenade[];
  /** Equipment value per player at freeze end (RoundPlayer). */
  equip: Record<string, number>;
}

/** Bombsite centres on the map; either may be unknown. */
export interface SiteCenters {
  A?: Vec3;
  B?: Vec3;
}

export interface WpMatch {
  tickRate: number;
  rounds: WpRound[];
  sites: SiteCenters;
}

/** "What if" applied to a state: who is counted alive or dead, extra equipment. */
export interface Counterfactual {
  /** Players counted alive even if they died (the death did not happen). */
  revive?: string[];
  /** Players counted dead (a trade that did not happen). */
  kill?: string[];
  /** Extra equipment value per player (a drop that did not happen). */
  addEquip?: Record<string, number>;
  /** Players counted as carrying a rifle. */
  addRifle?: string[];
}

// ─── Round context ───────────────────────────────────────

/** Everything about one round that the state builder needs, precomputed once. */
export interface RoundContext {
  round: WpRound;
  tickRate: number;
  sites: SiteCenters;
  freezeEnd: number;
  /** Last tick before the outcome is certain. */
  decided: number;
  /** steamId → side in this round. */
  sideOf: Map<string, Side>;
  /** steamId → tick of death. */
  deathTick: Map<string, number>;
  plant: WpBomb | null;
  frames: WpFrame[];
  /** Per frame: steamId → that player's row. */
  rows: Map<string, WpFramePlayer>[];
  /** Per frame: steamId → last primary weapon class seen in hand up to that frame. */
  primaryAt: Map<string, PrimaryClass>[];
  /**
   * steamId → the primary carried into the round: the first one seen in hand
   * after freeze end and before the round's first kill. Frames only store the
   * weapon in hand, not the inventory; until the first death no weapon can
   * change owner except by a drop, so this is what the player bought and runs
   * with (knife out) before drawing it.
   */
  openingPrimary: Map<string, PrimaryClass>;
  /** Per frame: steamId → last HP above zero up to that frame. */
  lastHpAt: Map<string, number>[];
}

const PRIMARY_RIFLES = new Set(["ak47", "m4a1", "m4a1_silencer", "galilar", "famas", "sg556", "aug"]);
const AWPS = new Set(["awp", "scar20", "g3sg1"]);
const OTHER_PRIMARIES = new Set([
  "mac10", "mp9", "mp7", "mp5sd", "ump45", "p90", "bizon", "ssg08",
  "nova", "xm1014", "mag7", "sawedoff", "m249", "negev",
]);

export type PrimaryClass = "rifle" | "awp" | "other";

export function primaryClass(rawWeapon: string): PrimaryClass | null {
  const w = normalizeWeapon(rawWeapon);
  if (!w) return null;
  if (PRIMARY_RIFLES.has(w)) return "rifle";
  if (AWPS.has(w)) return "awp";
  if (OTHER_PRIMARIES.has(w)) return "other";
  return null;
}

/** First frame where anyone moves: freeze time is over (same rule as tactics.ts). */
export function freezeEndOf(round: Pick<WpRound, "startTick" | "frames">, tickRate: number): number {
  for (const f of round.frames) {
    if (f.players.some((p) => p.isAlive && Math.hypot(p.velX, p.velY) > 1)) return f.tick;
  }
  return round.startTick + 15 * tickRate;
}

/** The last tick at which the round's result was still open. */
export function decidedTick(round: WpRound, plant: WpBomb | null, tickRate: number, freezeEnd: number): number {
  const by = (type: string) => round.bombs.filter((b) => b.type === type).sort((a, b) => a.tick - b.tick)[0];
  switch (round.winReason) {
    case "ELIMINATION": {
      const last = [...round.kills].sort((a, b) => b.tick - a.tick)[0];
      return last ? last.tick : round.endTick;
    }
    case "BOMB_EXPLODED":
      return by("EXPLODED")?.tick ?? (plant ? plant.tick + BOMB_TIME_S * tickRate : round.endTick);
    case "BOMB_DEFUSED":
      return by("DEFUSED")?.tick ?? round.endTick;
    default:
      return Math.min(round.endTick, freezeEnd + ROUND_TIME_S * tickRate);
  }
}

export function buildRoundContext(round: WpRound, tickRate: number, sites: SiteCenters): RoundContext {
  const frames = [...round.frames].sort((a, b) => a.tick - b.tick);
  const sideOf = new Map<string, Side>();
  for (const f of frames) for (const p of f.players) if (!sideOf.has(p.steamId)) sideOf.set(p.steamId, p.team);
  const deathTick = new Map<string, number>();
  for (const k of [...round.kills].sort((a, b) => a.tick - b.tick)) {
    if (!deathTick.has(k.victimSteamId)) deathTick.set(k.victimSteamId, k.tick);
  }
  const plant = round.bombs.filter((b) => b.type === "PLANTED").sort((a, b) => a.tick - b.tick)[0] ?? null;
  const freezeEnd = freezeEndOf({ ...round, frames }, tickRate);
  const rows: Map<string, WpFramePlayer>[] = [];
  const primaryAt: Map<string, PrimaryClass>[] = [];
  const lastHpAt: Map<string, number>[] = [];
  let primary = new Map<string, PrimaryClass>();
  let hp = new Map<string, number>();
  for (const f of frames) {
    rows.push(new Map(f.players.map((p) => [p.steamId, p])));
    primary = new Map(primary);
    hp = new Map(hp);
    for (const p of f.players) {
      const cls = primaryClass(p.weapon);
      if (cls) primary.set(p.steamId, cls);
      if (p.health > 0) hp.set(p.steamId, p.health);
    }
    primaryAt.push(primary);
    lastHpAt.push(hp);
  }
  const firstKill = round.kills.reduce((a, k) => Math.min(a, k.tick), Infinity);
  const openingPrimary = new Map<string, PrimaryClass>();
  for (const f of frames) {
    if (f.tick < freezeEnd) continue;
    if (f.tick >= firstKill) break;
    for (const p of f.players) {
      if (!p.isAlive || openingPrimary.has(p.steamId)) continue;
      const cls = primaryClass(p.weapon);
      if (cls) openingPrimary.set(p.steamId, cls);
    }
  }
  return {
    round: { ...round, frames },
    tickRate,
    sites,
    freezeEnd,
    decided: decidedTick(round, plant, tickRate, freezeEnd),
    sideOf,
    deathTick,
    plant,
    frames,
    rows,
    primaryAt,
    openingPrimary,
    lastHpAt,
  };
}

// ─── State ───────────────────────────────────────────────

/** Index of the last frame at or before `tick` (-1 when none). */
export function frameIndexAt(frames: WpFrame[], tick: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  if (hi < 0 || frames[0].tick > tick) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export interface PlayerState {
  steamId: string;
  side: Side;
  alive: boolean;
  pos: Vec3 | null;
  health: number;
  armor: number;
  primary: PrimaryClass | null;
  equip: number;
}

/**
 * Every player's state at `tick`: alive from the kill feed (exact tick) and
 * the frames, HP/armour/position from the last frame at or before it, primary
 * weapon = the last primary seen in hand this round (a player running with
 * the knife still carries the rifle), or before he first draws one, the
 * primary he carried into the round (openingPrimary).
 */
export function playersAt(ctx: RoundContext, tick: number, cf: Counterfactual = {}): PlayerState[] {
  const idx = Math.max(0, frameIndexAt(ctx.frames, tick));
  const rows = ctx.rows[idx];
  const revive = new Set(cf.revive ?? []);
  const kill = new Set(cf.kill ?? []);
  const rifle = new Set(cf.addRifle ?? []);
  const out: PlayerState[] = [];
  for (const [steamId, side] of ctx.sideOf) {
    const s = rows?.get(steamId);
    const death = ctx.deathTick.get(steamId);
    const diedByKill = death != null && death <= tick;
    // A player the frames show dead without a kill (fall damage, bomb) stays dead.
    let alive = !diedByKill && (s?.isAlive ?? false);
    if (revive.has(steamId) && s != null) alive = true;
    if (kill.has(steamId)) alive = false;
    // A revived player keeps the HP they had a moment before the death.
    const health = alive ? (s && s.health > 0 ? s.health : (ctx.lastHpAt[idx]?.get(steamId) ?? 1)) : 0;
    out.push({
      steamId,
      side,
      alive,
      pos: s ? { x: s.x, y: s.y, z: s.z } : null,
      health,
      armor: alive ? (s?.armor ?? 0) : 0,
      primary: rifle.has(steamId)
        ? "rifle"
        : (ctx.primaryAt[idx]?.get(steamId) ?? ctx.openingPrimary.get(steamId) ?? null),
      equip: (ctx.round.equip[steamId] ?? 0) + (cf.addEquip?.[steamId] ?? 0),
    });
  }
  return out;
}

function siteDistance(p: Vec3, sites: SiteCenters): number {
  const d = [sites.A, sites.B].filter((s): s is Vec3 => s != null).map((s) => dist(p, s));
  return d.length > 0 ? Math.min(...d) : NaN;
}

const min = (xs: number[]) => (xs.length > 0 ? Math.min(...xs) : NaN);
const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : v);
const r2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : v);

/** The model's features at `tick` (optionally under a counterfactual). */
export function stateAt(ctx: RoundContext, tick: number, cf: Counterfactual = {}): WpFeatures {
  const players = playersAt(ctx, tick, cf);
  const alive = (side: Side) => players.filter((p) => p.side === side && p.alive);
  const T = alive("T");
  const CT = alive("CT");
  const sum = (ps: PlayerState[], f: (p: PlayerState) => number) => ps.reduce((a, p) => a + f(p), 0);
  const avg = (ps: PlayerState[], f: (p: PlayerState) => number) => (ps.length > 0 ? sum(ps, f) / ps.length : 0);

  const planted = ctx.plant != null && ctx.plant.tick <= tick;
  const bomb: Vec3 | null = planted ? { x: ctx.plant!.posX, y: ctx.plant!.posY, z: ctx.plant!.posZ } : null;
  const secs = (ticks: number) => ticks / ctx.tickRate;
  const timeLeft = planted
    ? Math.max(0, BOMB_TIME_S - secs(tick - ctx.plant!.tick))
    : Math.max(0, ROUND_TIME_S - secs(Math.max(0, tick - ctx.freezeEnd)));

  const lastDefuse = ctx.round.bombs
    .filter((b) => b.type === "DEFUSE_BEGIN" && b.tick <= tick && secs(tick - b.tick) <= DEFUSE_WINDOW_S)
    .sort((a, b) => b.tick - a.tick)[0];
  const defusing =
    planted && lastDefuse != null && CT.some((p) => p.steamId === lastDefuse.playerSteamId) ? 1 : 0;

  const posOf = (ps: PlayerState[]) => ps.map((p) => p.pos).filter((p): p is Vec3 => p != null);
  const utilBy = (side: Side) =>
    ctx.round.grenades.filter((g) => g.tick <= tick && ctx.sideOf.get(g.throwerSteamId) === side).length;

  const ctBombDist = bomb ? min(posOf(CT).map((p) => dist(p, bomb))) : NaN;
  const margin = timeLeft - (ctBombDist / RETAKE_SPEED + DEFUSE_ASSUMED_S);
  return {
    t_alive: T.length,
    ct_alive: CT.length,
    alive_diff: T.length - CT.length,
    alive_log_ratio: r2(Math.log((T.length + 0.5) / (CT.length + 0.5))),
    t_hp: sum(T, (p) => p.health),
    ct_hp: sum(CT, (p) => p.health),
    t_armor: T.filter((p) => p.armor > 0).length,
    ct_armor: CT.filter((p) => p.armor > 0).length,
    t_equip: r2(sum(T, (p) => p.equip) / 1000),
    ct_equip: r2(sum(CT, (p) => p.equip) / 1000),
    // Per alive player, so a kill does not count twice (once as a player, once as his gun).
    equip_avg_diff: r2((avg(T, (p) => p.equip) - avg(CT, (p) => p.equip)) / 1000),
    t_rifles: T.filter((p) => p.primary === "rifle" || p.primary === "awp").length,
    ct_rifles: CT.filter((p) => p.primary === "rifle" || p.primary === "awp").length,
    t_awps: T.filter((p) => p.primary === "awp").length,
    ct_awps: CT.filter((p) => p.primary === "awp").length,
    time_left: r2(timeLeft),
    planted: planted ? 1 : 0,
    // Before the plant T run out of time: 0 with the full clock, → 1 at 0:00.
    time_pressure: planted ? 0 : r2(1 / (1 + timeLeft / 10)),
    // After the plant: seconds CT have to spare if the nearest one runs to the bomb and defuses
    // (capped at 10: with that much to spare the race no longer decides anything).
    defuse_margin: bomb ? r2(clamp(margin, -20, 10)) : NaN,
    // …and how many seconds short they are: straight-line running is optimistic, so a
    // negative margin is reliable and decides the round almost whatever the numbers.
    defuse_short: bomb ? r2(Number.isFinite(margin) ? Math.min(20, Math.max(0, -margin)) : 20) : 0,
    defusing,
    ct_bomb_dist: bomb ? r2(ctBombDist / 1000) : NaN,
    t_bomb_dist: bomb ? r2(min(posOf(T).map((p) => dist(p, bomb))) / 1000) : NaN,
    t_site_dist: bomb ? NaN : r2(min(posOf(T).map((p) => siteDistance(p, ctx.sites))) / 1000),
    ct_site_dist: bomb ? NaN : r2(mean(posOf(CT).map((p) => siteDistance(p, ctx.sites))) / 1000),
    t_util_used: utilBy("T"),
    ct_util_used: utilBy("CT"),
  };
}

export const featureVector = (f: WpFeatures): number[] => WP_FEATURES.map((k) => f[k]);

// ─── Training snapshots ──────────────────────────────────

export interface Snapshot {
  roundNumber: number;
  tick: number;
  /** 1 when T won the round. */
  tWin: 0 | 1;
  features: number[];
}

/** Can this round be replayed? Needs frames with both sides and a known winner. */
export function usableRound(ctx: RoundContext): boolean {
  if (ctx.frames.length === 0) return false;
  const sides = new Set(ctx.sideOf.values());
  return sides.has("CT") && sides.has("T") && ctx.decided > ctx.freezeEnd;
}

/**
 * Can this round teach the model? Its result must follow from the game state:
 * a surrender, a vote or a demo cut short is stored as ELIMINATION (round-end.ts)
 * with the "losers" still alive, and would label any state as a win.
 * The replay strip and WPA still use such rounds (usableRound): their kills are real.
 */
export function trainableRound(ctx: RoundContext): boolean {
  if (!usableRound(ctx)) return false;
  const { winner, winReason } = ctx.round;
  switch (winReason) {
    case "ELIMINATION": {
      const loser = otherSide(winner);
      return !playersAt(ctx, ctx.decided).some((p) => p.side === loser && p.alive);
    }
    case "BOMB_EXPLODED":
      return winner === "T" && ctx.plant != null;
    case "BOMB_DEFUSED":
      return winner === "CT" && ctx.plant != null;
    case "TIME_RAN_OUT":
    case "TARGET_SAVED":
      return winner === "CT" && ctx.plant == null;
    default:
      return false;
  }
}

/** Snapshot ticks of a round: a regular grid plus right after every kill and the plant. */
export function snapshotTicks(ctx: RoundContext): number[] {
  const step = Math.max(1, Math.round(SNAPSHOT_STEP_S * ctx.tickRate));
  const ticks = new Set<number>();
  for (let t = ctx.freezeEnd; t < ctx.decided; t += step) ticks.add(t);
  for (const k of ctx.round.kills) if (k.tick >= ctx.freezeEnd && k.tick < ctx.decided) ticks.add(k.tick);
  if (ctx.plant && ctx.plant.tick < ctx.decided) ticks.add(ctx.plant.tick);
  return [...ticks].sort((a, b) => a - b);
}

/** Training snapshots of a whole match. Rounds without frames or with a result the state can't explain are skipped. */
export function matchSnapshots(match: WpMatch): Snapshot[] {
  const out: Snapshot[] = [];
  for (const round of match.rounds) {
    const ctx = buildRoundContext(round, match.tickRate, match.sites);
    if (!trainableRound(ctx)) continue;
    const tWin = round.winner === "T" ? 1 : 0;
    for (const tick of snapshotTicks(ctx)) {
      out.push({ roundNumber: round.number, tick, tWin, features: featureVector(stateAt(ctx, tick)) });
    }
  }
  return out;
}

// ─── Map sites ───────────────────────────────────────────

/**
 * Bombsite centres from the game's own callouts (MapPlaceCell, "BombsiteA" /
 * "BombsiteB"), falling back to where bombs were planted on that map.
 */
export function siteCenters(
  places: Array<{ place: string; x: number; y: number; z: number; count: number }>,
  plants: Array<{ site: string | null; x: number; y: number; z: number }>
): SiteCenters {
  const out: SiteCenters = {};
  for (const site of ["A", "B"] as const) {
    const cells = places.filter((c) => c.place.toLowerCase() === `bombsite${site.toLowerCase()}`);
    const w = cells.reduce((a, c) => a + c.count, 0);
    if (w > 0) {
      out[site] = {
        x: cells.reduce((a, c) => a + c.x * c.count, 0) / w,
        y: cells.reduce((a, c) => a + c.y * c.count, 0) / w,
        z: cells.reduce((a, c) => a + c.z * c.count, 0) / w,
      };
      continue;
    }
    const ps = plants.filter((p) => (p.site ?? "").toUpperCase().endsWith(site));
    if (ps.length > 0) {
      out[site] = {
        x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
        y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
        z: ps.reduce((a, p) => a + p.z, 0) / ps.length,
      };
    }
  }
  return out;
}
