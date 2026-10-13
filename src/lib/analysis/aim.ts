/**
 * Mechanics 2: aim and duels — crosshair placement, reaction time, time to
 * damage, spray control, flick vs tracking (and overflicks), peek types,
 * running and jumping within earshot of enemies, reloads at a bad moment.
 *
 * Pure module (no parser, no DB). Inputs are the stored replay data
 * (RoundTicks frames, ShotEvent, DamageEvent, Kill, GrenadeEvent, ReloadEvent),
 * so it runs after the .dem is gone and is covered by `npm run test:aim`.
 *
 * Visibility ("when did the player see the enemy"):
 * - Replay format v2 stores the game's own spotting (m_bSpottedByMask): an
 *   enemy is visible to P on frames where P is in its `spottedBy` list. That
 *   is real line of sight, so walls and smokes count.
 * - Older matches (format v1) fall back to an approximation without map
 *   geometry: the enemy is inside P's field of view and within VISIBLE_RANGE,
 *   only in the last FOV_LOOKBACK_S before the duel's first damage. Reaction
 *   time is not measured there, because the moment of first sight is unknown.
 *
 * A duel is a run of damage between two enemies with gaps under DUEL_GAP_S.
 * Every metric is judged from what the player could know: the crosshair angle
 * is taken at the first frame the player could see the enemy; running/jumping
 * near an enemy only counts as a mistake when the player's team had seen that
 * enemy recently (spotting data) or got hit by them soon after.
 */
import { normalizeWeapon, WEAPON_MAX_SPEED } from "./movement";

/** Bump when the analysis changes, so stored stats are recomputed. */
export const AIM_VERSION = 4;

// ─── Tunables ────────────────────────────────────────────

/** Damage between the same two players closer than this belongs to one duel. */
export const DUEL_GAP_S = 3;
/** How far back from a duel's first damage to look for the first sight (spotting data). */
export const SPOT_LOOKBACK_S = 4;
/** Same, for the FOV approximation (no spotting data). */
export const FOV_LOOKBACK_S = 1;
/** Half-angle of the player's field of view used by the FOV approximation. */
export const FOV_HALF_DEG = 50;
/** Beyond this distance the FOV approximation does not count an enemy as visible. */
export const VISIBLE_RANGE = 3000;
/** Eye height above the origin; heads are at the same height. */
const EYE_HEIGHT = 64;
/** Crosshair further than this from the enemy's head at first sight is a moment. */
export const CROSSHAIR_BAD_DEG = 15;
/** Reaction: the aim must swing this much toward the enemy between two frames. */
const REACT_MIN_DEG = 1.5;
/** Ignore reactions / time to damage beyond these (player engaged someone else first). */
const REACTION_MAX_S = 1.5;
/** Faster than this is anticipation (sound, info) or spotting lag, not a reaction. */
const REACTION_MIN_MS = 100;
const TTD_MAX_S = 3;
/** Error before the hit at or below which the shot was pre-aimed. */
export const PREAIM_DEG = 4;
/** Error before the hit at or above which a fast correction is a flick. */
export const FLICK_MIN_DEG = 6;
/** Peak view speed of a flick (deg/s). */
export const FLICK_SPEED = 180;
/** How far before the hit the flick/tracking window starts. */
const FLICK_WINDOW_S = 0.3;
/** Crossing the head and continuing this far past it is an overflick. */
export const OVERFLICK_DEG = 3;
/** Sprays: shots per burst before "spray control" starts to matter. */
export const SPRAY_FROM_BULLET = 4;
/** Shots further apart than this start a new burst (as in movement.ts). */
const BURST_GAP_S = 0.35;
/** player_hurt may land a few ticks after weapon_fire (sub-tick). */
const HIT_WINDOW_TICKS = 4;
/** Peeker: moving at least this share of max speed when first seen. */
export const PEEK_SPEED_FRACTION = 0.5;
/** Wide peek: lateral distance covered around first sight. */
export const WIDE_PEEK_UNITS = 90;
/** Peek window around first sight. */
const PEEK_BEFORE_S = 0.25;
const PEEK_AFTER_S = 0.6;
/** Lateral speed that counts as moving in one direction during a jiggle. */
const JIGGLE_SPEED = 80;
/** A teammate flash popped this long before the peek makes it not dry. */
export const FLASH_SUPPORT_S = 3;
/** Footsteps: running faster than this share of max speed is audible. */
export const NOISY_SPEED_FRACTION = 0.55;
/** Footsteps / landings are heard within this distance (units). */
export const HEAR_RANGE = 1100;
/** Minimum length of a noisy run. */
const NOISE_MIN_S = 0.25;
/** No noise check while a fight is on (damage either way this recently). */
const IN_FIGHT_S = 2;
/** Noise or a jump is "costly" when the player takes enemy damage this soon after. */
export const COSTLY_AFTER_S = 4;
/** The team saw the enemy this recently → the player knew someone was near. */
const KNEW_S = 5;
/** Vertical speed of a jump take-off (CS2 jump impulse is ~300 u/s). */
const JUMP_VZ = 200;
/** Vertical speed above which the player is airborne (as in movement.ts). */
const AIRBORNE_SPEED = 30;
/** Reloading is risky this long after it starts (rifle reloads are ~2.5 s). */
export const RELOAD_RISK_S = 2.5;
/** Reloading with at least this share of the magazine while an enemy is near. */
export const RELOAD_EARLY_FRACTION = 0.4;
/** An enemy within this distance makes a reload dangerous. */
const RELOAD_DANGER_RANGE = 1500;
/** Cap on stored moments per type per player, to bound the row size. */
export const MAX_MOMENTS_PER_TYPE = 40;

/** Magazine size per gun (normalizeWeapon names). */
export const MAG_SIZE: Record<string, number> = {
  glock: 20, hkp2000: 13, usp_silencer: 12, p250: 13, elite: 30, fiveseven: 20,
  tec9: 18, cz75a: 12, deagle: 7, revolver: 8,
  mac10: 30, mp9: 30, mp7: 30, mp5sd: 30, ump45: 25, p90: 50, bizon: 64,
  ak47: 30, m4a1: 30, m4a1_silencer: 20, galilar: 35, famas: 25, sg556: 30, aug: 30,
  awp: 5, ssg08: 10, scar20: 20, g3sg1: 20,
  nova: 8, xm1014: 7, mag7: 5, sawedoff: 7, m249: 100, negev: 150,
};

/** Guns with a real spray (automatic fire). */
const AUTOMATIC = new Set([
  "mac10", "mp9", "mp7", "mp5sd", "ump45", "p90", "bizon",
  "ak47", "m4a1", "m4a1_silencer", "galilar", "famas", "sg556", "aug",
  "m249", "negev", "cz75a",
]);

// ─── Inputs ──────────────────────────────────────────────

export interface AimFramePlayer {
  steamId: string;
  team: "CT" | "T";
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  pitch: number;
  yaw: number;
  isAlive: boolean;
  weapon: string;
  /** Who can see this player; undefined when the round has no spotting data. */
  spottedBy?: string[];
}

export interface AimFrame {
  tick: number;
  players: AimFramePlayer[];
}

export interface AimShot {
  tick: number;
  roundNumber: number;
  steamId: string;
  weapon: string;
  velX: number;
  velY: number;
  velZ: number;
}

export interface AimDamage {
  tick: number;
  roundNumber: number;
  attackerSteamId: string | null;
  victimSteamId: string;
  weapon: string;
}

export interface AimKill {
  tick: number;
  roundNumber: number;
  attackerSteamId: string;
  victimSteamId: string;
}

/** A flashbang detonation. */
export interface AimFlash {
  tick: number;
  roundNumber: number;
  throwerSteamId: string;
}

export interface AimReload {
  tick: number;
  roundNumber: number;
  steamId: string;
  weapon: string;
  clip: number | null;
}

export interface AimInput {
  tickRate: number;
  rounds: Array<{ number: number; startTick: number; frames: AimFrame[] }>;
  shots: AimShot[];
  damages: AimDamage[];
  kills: AimKill[];
  flashes: AimFlash[];
  reloads: AimReload[];
}

// ─── Outputs ─────────────────────────────────────────────

export type PeekType = "wide" | "tight" | "jiggle" | "shoulder";
export const PEEK_TYPES: PeekType[] = ["wide", "tight", "jiggle", "shoulder"];

export type AimMomentType =
  | "crosshair"
  | "reaction"
  | "spray"
  | "overflick"
  | "dry_peek"
  | "noise"
  | "jump"
  | "air_shot"
  | "reload";

export interface AimMoment {
  type: AimMomentType;
  roundNumber: number;
  tick: number;
  /** Seconds since round start (freeze time included). */
  roundTime: number;
  /** The main number of the moment (degrees, ms, %, units…), see `type`. */
  value: number;
  /** Short facts in Polish for the moment card. */
  detail: string;
  /** Did it end badly (lost duel, got hit, died)? */
  costly: boolean;
  /** The enemy the moment is about (duel opponent, enemy within earshot…), if known. */
  enemy?: string;
  /** Gun, for moments about one shot (air_shot). */
  weapon?: string;
}

export interface PeekTally {
  count: number;
  won: number;
  lost: number;
}

export interface PlayerAim {
  steamId: string;
  visibility: "spotted" | "fov" | "mixed";
  duels: number;
  duelsUnseen: number;
  crosshairSamples: number;
  crosshairAvgDeg: number | null;
  crosshairMedianDeg: number | null;
  crosshairBad: number;
  reactionSamples: number;
  reactionMedianMs: number | null;
  ttdSamples: number;
  ttdMedianMs: number | null;
  sprays: number;
  sprayBullets: number;
  sprayHits: number;
  flicks: number;
  trackings: number;
  preaims: number;
  overflicks: number;
  peeks: number;
  peeksWon: number;
  dryPeeks: number;
  dryPeeksLost: number;
  noiseEpisodes: number;
  noiseCostly: number;
  jumps: number;
  jumpsNearEnemy: number;
  airShots: number;
  reloads: number;
  badReloads: number;
  reloadData: boolean;
  peekTypes: Record<PeekType, PeekTally>;
  moments: AimMoment[];
}

// ─── Geometry ────────────────────────────────────────────

const RAD = Math.PI / 180;

/** Signed difference a − b wrapped into (−180, 180]. */
export function wrapDeg(d: number): number {
  let x = ((d + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

/** Yaw/pitch (CS convention: pitch positive = looking down) from a to b. */
export function anglesTo(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): { yaw: number; pitch: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return {
    yaw: Math.atan2(dy, dx) / RAD,
    pitch: -Math.atan2(dz, Math.hypot(dx, dy)) / RAD,
  };
}

/** Angle in degrees between two view directions. */
export function angleBetween(yaw1: number, pitch1: number, yaw2: number, pitch2: number): number {
  const v = (yaw: number, pitch: number) => [
    Math.cos(pitch * RAD) * Math.cos(yaw * RAD),
    Math.cos(pitch * RAD) * Math.sin(yaw * RAD),
    -Math.sin(pitch * RAD),
  ];
  const a = v(yaw1, pitch1);
  const b = v(yaw2, pitch2);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  return Math.acos(dot) / RAD;
}

/** Crosshair error from `p`'s view to `e`'s head: total and signed yaw part. */
export function aimError(p: AimFramePlayer, e: AimFramePlayer): { total: number; yaw: number } {
  const want = anglesTo(
    { x: p.x, y: p.y, z: p.z + EYE_HEIGHT },
    { x: e.x, y: e.y, z: e.z + EYE_HEIGHT }
  );
  return {
    total: angleBetween(p.yaw, p.pitch, want.yaw, want.pitch),
    yaw: wrapDeg(p.yaw - want.yaw),
  };
}

const dist = (a: AimFramePlayer, b: AimFramePlayer) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const speed2d = (p: { velX: number; velY: number }) => Math.hypot(p.velX, p.velY);
const maxSpeedOf = (weapon: string) => {
  const g = normalizeWeapon(weapon);
  return g ? WEAPON_MAX_SPEED[g] : 250;
};

// ─── Analysis ────────────────────────────────────────────

interface RoundCtx {
  number: number;
  startTick: number;
  frames: AimFrame[];
  hasSpotting: boolean;
  /** frame index → steamId → player */
  index: Array<Map<string, AimFramePlayer>>;
}

interface Duel {
  round: number;
  a: string;
  b: string;
  start: number;
  end: number;
  /** Who dealt the first damage. */
  opener: string;
  /** Who died in the duel, if anyone. */
  died: string | null;
}

function emptyPlayer(steamId: string): PlayerAim {
  return {
    steamId,
    visibility: "fov",
    duels: 0, duelsUnseen: 0,
    crosshairSamples: 0, crosshairAvgDeg: null, crosshairMedianDeg: null, crosshairBad: 0,
    reactionSamples: 0, reactionMedianMs: null,
    ttdSamples: 0, ttdMedianMs: null,
    sprays: 0, sprayBullets: 0, sprayHits: 0,
    flicks: 0, trackings: 0, preaims: 0, overflicks: 0,
    peeks: 0, peeksWon: 0, dryPeeks: 0, dryPeeksLost: 0,
    noiseEpisodes: 0, noiseCostly: 0,
    jumps: 0, jumpsNearEnemy: 0, airShots: 0,
    reloads: 0, badReloads: 0, reloadData: false,
    peekTypes: { wide: tally(), tight: tally(), jiggle: tally(), shoulder: tally() },
    moments: [],
  };
}

function tally(): PeekTally {
  return { count: 0, won: 0, lost: 0 };
}

export function analyzeAim(input: AimInput): PlayerAim[] {
  const { tickRate } = input;
  const s2t = (s: number) => s * tickRate;

  const rounds = new Map<number, RoundCtx>();
  for (const r of input.rounds) {
    const frames = [...r.frames].sort((a, b) => a.tick - b.tick);
    rounds.set(r.number, {
      number: r.number,
      startTick: r.startTick,
      frames,
      hasSpotting: frames.some((f) => f.players.some((p) => p.spottedBy !== undefined)),
      index: frames.map((f) => new Map(f.players.map((p) => [p.steamId, p]))),
    });
  }

  const players = new Map<string, PlayerAim>();
  const out = (id: string) => {
    let p = players.get(id);
    if (!p) {
      p = emptyPlayer(id);
      players.set(id, p);
    }
    return p;
  };
  const seenModes = new Map<string, Set<"spotted" | "fov">>();
  const crosshairs = new Map<string, number[]>();
  const reactions = new Map<string, number[]>();
  const ttds = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, id: string, v: number) => {
    const list = m.get(id) ?? [];
    list.push(v);
    m.set(id, list);
  };
  const addMoment = (id: string, m: AimMoment) => {
    const p = out(id);
    if (p.moments.filter((x) => x.type === m.type).length < MAX_MOMENTS_PER_TYPE) p.moments.push(m);
  };
  const roundTime = (round: number, tick: number) => {
    const r = rounds.get(round);
    return r ? Math.round(((tick - r.startTick) / tickRate) * 10) / 10 : 0;
  };

  // Side per round from the frames (per-half correct, see CLAUDE.md).
  const teamOf = (round: number, id: string): "CT" | "T" | undefined => {
    const r = rounds.get(round);
    if (!r) return undefined;
    for (const m of r.index) {
      const p = m.get(id);
      if (p) return p.team;
    }
    return undefined;
  };
  const isEnemy = (round: number, a: string, b: string) => {
    if (a === b) return false;
    const ta = teamOf(round, a);
    const tb = teamOf(round, b);
    return !!ta && !!tb && ta !== tb;
  };

  /** Index of the last frame at or before `tick` (−1 if none). */
  const frameAt = (r: RoundCtx, tick: number) => {
    let lo = 0;
    let hi = r.frames.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (r.frames[mid].tick <= tick) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };

  /** Can `obs` see `target` on frame i? */
  const sees = (r: RoundCtx, i: number, obs: string, target: string) => {
    const o = r.index[i]?.get(obs);
    const t = r.index[i]?.get(target);
    if (!o || !t || !o.isAlive || !t.isAlive) return false;
    if (r.hasSpotting) return !!t.spottedBy?.includes(obs);
    if (dist(o, t) > VISIBLE_RANGE) return false;
    return aimError(o, t).total <= FOV_HALF_DEG;
  };

  /** Did anyone on `team` see `target` within the last KNEW_S before frame i? */
  const teamKnew = (r: RoundCtx, i: number, team: "CT" | "T", target: string): boolean | null => {
    if (!r.hasSpotting) return null;
    const from = r.frames[i].tick - s2t(KNEW_S);
    for (let k = i; k >= 0 && r.frames[k].tick >= from; k--) {
      const t = r.index[k].get(target);
      if (!t?.spottedBy) continue;
      for (const id of t.spottedBy) {
        if (r.index[k].get(id)?.team === team) return true;
      }
    }
    return false;
  };

  // ── Hits: enemy damage → the attacker's latest shot with that gun ──
  const shotsBy = new Map<string, Array<AimShot & { gun: string; hit: boolean }>>();
  for (const s of [...input.shots].sort((a, b) => a.tick - b.tick)) {
    const gun = normalizeWeapon(s.weapon);
    if (!gun) continue;
    const list = shotsBy.get(s.steamId) ?? [];
    list.push({ ...s, gun, hit: false });
    shotsBy.set(s.steamId, list);
  }
  const enemyDamage = input.damages
    .filter((d) => d.attackerSteamId && isEnemy(d.roundNumber, d.attackerSteamId, d.victimSteamId))
    .sort((a, b) => a.tick - b.tick) as Array<AimDamage & { attackerSteamId: string }>;
  for (const d of enemyDamage) {
    const gun = normalizeWeapon(d.weapon);
    const list = gun ? shotsBy.get(d.attackerSteamId) : undefined;
    if (!list) continue;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].tick > d.tick) continue;
      if (d.tick - list[i].tick > HIT_WINDOW_TICKS) break;
      if (list[i].gun === gun) {
        list[i].hit = true;
        break;
      }
    }
  }
  const damageTakenTicks = new Map<string, number[]>();
  for (const d of enemyDamage) {
    const l = damageTakenTicks.get(d.victimSteamId) ?? [];
    l.push(d.tick);
    damageTakenTicks.set(d.victimSteamId, l);
  }
  const fightTicks = new Map<string, number[]>(); // damage dealt or taken
  for (const d of enemyDamage) {
    for (const id of [d.attackerSteamId, d.victimSteamId]) {
      const l = fightTicks.get(id) ?? [];
      l.push(d.tick);
      fightTicks.set(id, l);
    }
  }
  // Duels are gunfights: grenade, molotov and knife damage neither opens nor
  // extends one (it still counts as damage taken / a fight above).
  const gunDamage = enemyDamage.filter((d) => normalizeWeapon(d.weapon) != null);
  const anyIn = (ticks: number[] | undefined, from: number, to: number) =>
    !!ticks && ticks.some((t) => t >= from && t <= to);

  // ── Duels ──
  const duels: Duel[] = [];
  const open = new Map<string, Duel>();
  for (const d of gunDamage) {
    const [a, b] = [d.attackerSteamId, d.victimSteamId].sort();
    const key = `${d.roundNumber}:${a}:${b}`;
    const cur = open.get(key);
    if (cur && d.tick - cur.end <= s2t(DUEL_GAP_S)) {
      cur.end = d.tick;
    } else {
      const duel: Duel = { round: d.roundNumber, a, b, start: d.tick, end: d.tick, opener: d.attackerSteamId, died: null };
      duels.push(duel);
      open.set(key, duel);
    }
  }
  for (const k of input.kills) {
    const duel = duels.find(
      (x) =>
        x.round === k.roundNumber &&
        ((x.a === k.attackerSteamId && x.b === k.victimSteamId) ||
          (x.b === k.attackerSteamId && x.a === k.victimSteamId)) &&
        k.tick >= x.start &&
        k.tick <= x.end + HIT_WINDOW_TICKS
    );
    if (duel) duel.died = k.victimSteamId;
  }

  const flashesBy = input.flashes;

  for (const duel of duels) {
    const r = rounds.get(duel.round);
    if (!r || r.frames.length === 0) continue;
    for (const [pId, eId] of [[duel.a, duel.b], [duel.b, duel.a]] as const) {
      const p = out(pId);
      p.duels++;
      const modes = seenModes.get(pId) ?? new Set();
      modes.add(r.hasSpotting ? "spotted" : "fov");
      seenModes.set(pId, modes);

      // First sight: a visible frame at the duel start, then walk back.
      const i0 = frameAt(r, duel.start);
      let vis = -1;
      for (let k = Math.max(0, i0 - 1); k <= Math.min(r.frames.length - 1, i0 + 2); k++) {
        if (sees(r, k, pId, eId)) {
          vis = k;
          break;
        }
      }
      if (vis === -1) {
        p.duelsUnseen++;
        continue;
      }
      const lookback = s2t(r.hasSpotting ? SPOT_LOOKBACK_S : FOV_LOOKBACK_S);
      let first = vis;
      while (first > 0 && r.frames[first - 1].tick >= duel.start - lookback && sees(r, first - 1, pId, eId)) first--;
      // Seen since before the window: the onset is unknown → no reaction time.
      const capped = first > 0 && r.frames[first - 1].tick < duel.start - lookback && sees(r, first - 1, pId, eId);
      const onsetKnown = r.hasSpotting && !capped;
      const spotTick = r.frames[first].tick;
      const P0 = r.index[first].get(pId)!;
      const E0 = r.index[first].get(eId)!;
      const lost = duel.died === pId;
      const won = duel.died === eId;

      // Crosshair placement.
      const err0 = aimError(P0, E0);
      push(crosshairs, pId, err0.total);
      if (err0.total > CROSSHAIR_BAD_DEG) {
        p.crosshairBad++;
        addMoment(pId, {
          type: "crosshair",
          roundNumber: duel.round,
          tick: spotTick,
          roundTime: roundTime(duel.round, spotTick),
          value: Math.round(err0.total),
          detail: `${Math.round(Math.abs(err0.yaw))}° w poziomie od głowy wroga`,
          costly: lost,
          enemy: eId,
        });
      }

      // Shots and damage by P after first sight.
      const pShots = (shotsBy.get(pId) ?? []).filter(
        (s) => s.roundNumber === duel.round && s.tick >= spotTick && s.tick <= duel.end + HIT_WINDOW_TICKS
      );
      const firstShot = pShots[0];
      // P's first gun hit on E inside this duel (never a later duel's hit).
      const firstDmg = gunDamage.find(
        (d) =>
          d.roundNumber === duel.round &&
          d.attackerSteamId === pId &&
          d.victimSteamId === eId &&
          d.tick >= Math.max(spotTick, duel.start) &&
          d.tick <= duel.end
      );

      // Reaction: first swing toward the enemy, or the first shot. A player who
      // was already turning toward the enemy at first sight reacted to
      // something earlier (sound, info): the onset is unknown, no sample.
      let alreadyTurning = false;
      if (first > 0) {
        const pPrev = r.index[first - 1].get(pId);
        const ePrev = r.index[first - 1].get(eId);
        if (pPrev && ePrev) {
          const turned = angleBetween(pPrev.yaw, pPrev.pitch, P0.yaw, P0.pitch);
          const closer = aimError(pPrev, ePrev).total - err0.total;
          alreadyTurning = turned >= REACT_MIN_DEG && closer >= REACT_MIN_DEG;
        }
      }
      let swingTick: number | null = null;
      for (let k = first + 1; k < r.frames.length && r.frames[k].tick <= spotTick + s2t(REACTION_MAX_S); k++) {
        const pPrev = r.index[k - 1].get(pId);
        const pCur = r.index[k].get(pId);
        const eCur = r.index[k].get(eId);
        const ePrev = r.index[k - 1].get(eId);
        if (!pPrev || !pCur || !eCur || !ePrev || !pCur.isAlive) break;
        const turned = angleBetween(pPrev.yaw, pPrev.pitch, pCur.yaw, pCur.pitch);
        const closer = aimError(pPrev, ePrev).total - aimError(pCur, eCur).total;
        if (turned >= REACT_MIN_DEG && closer >= REACT_MIN_DEG) {
          // The first frame where the swing is observed.
          swingTick = r.frames[k].tick;
          break;
        }
      }
      const shotTick = firstShot && firstShot.tick - spotTick <= s2t(REACTION_MAX_S) ? firstShot.tick : null;
      const reactTick = swingTick != null && shotTick != null ? Math.min(swingTick, shotTick) : swingTick ?? shotTick;
      const reactMs = reactTick != null ? ((reactTick - spotTick) / tickRate) * 1000 : null;
      if (onsetKnown && !alreadyTurning && reactMs != null && reactMs >= REACTION_MIN_MS) {
        const ms = reactMs;
        push(reactions, pId, ms);
        if (ms > 450 && lost) {
          addMoment(pId, {
            type: "reaction",
            roundNumber: duel.round,
            tick: spotTick,
            roundTime: roundTime(duel.round, spotTick),
            value: Math.round(ms),
            detail: "wolna reakcja na wroga, przegrany pojedynek",
            costly: true,
            enemy: eId,
          });
        }
      }
      if (onsetKnown && firstDmg && firstDmg.tick - spotTick <= s2t(TTD_MAX_S)) {
        push(ttds, pId, ((firstDmg.tick - spotTick) / tickRate) * 1000);
      }

      // Flick / tracking / pre-aim on the first hit; overflick before it.
      if (firstDmg) {
        const hitFrame = frameAt(r, firstDmg.tick);
        const startFrame = Math.max(first, frameAt(r, firstDmg.tick - s2t(FLICK_WINDOW_S)));
        const ps = r.index[startFrame]?.get(pId);
        const es = r.index[startFrame]?.get(eId);
        if (ps && es && hitFrame >= startFrame) {
          const errStart = aimError(ps, es).total;
          let peak = 0;
          for (let k = startFrame + 1; k <= hitFrame; k++) {
            const a = r.index[k - 1].get(pId);
            const b = r.index[k].get(pId);
            if (!a || !b) continue;
            const dt = (r.frames[k].tick - r.frames[k - 1].tick) / tickRate;
            if (dt > 0) peak = Math.max(peak, angleBetween(a.yaw, a.pitch, b.yaw, b.pitch) / dt);
          }
          if (errStart <= PREAIM_DEG && peak < FLICK_SPEED) p.preaims++;
          else if (errStart >= FLICK_MIN_DEG && peak >= FLICK_SPEED) p.flicks++;
          else p.trackings++;
        }
        // Overflick: the yaw error changes sign after a big swing and overshoots.
        let prevYaw: number | null = null;
        let maxBefore = 0;
        for (let k = first; k <= hitFrame && k < r.frames.length; k++) {
          const a = r.index[k].get(pId);
          const b = r.index[k].get(eId);
          if (!a || !b) continue;
          const e = aimError(a, b).yaw;
          if (prevYaw != null && Math.sign(e) !== Math.sign(prevYaw) && maxBefore >= FLICK_MIN_DEG && Math.abs(e) >= OVERFLICK_DEG) {
            p.overflicks++;
            addMoment(pId, {
              type: "overflick",
              roundNumber: duel.round,
              tick: r.frames[k].tick,
              roundTime: roundTime(duel.round, r.frames[k].tick),
              value: Math.round(Math.abs(e)),
              detail: `przestrzelony flick o ${Math.round(Math.abs(e))}°`,
              costly: lost,
              enemy: eId,
            });
            break;
          }
          maxBefore = Math.max(maxBefore, Math.abs(e));
          prevYaw = e;
        }
      }

      // Peeks: P was moving into the fight when first seen.
      const pBefore = r.index[frameAt(r, spotTick - s2t(PEEK_BEFORE_S))]?.get(pId) ?? P0;
      const peekSpeed = Math.max(speed2d(P0), speed2d(pBefore));
      if (peekSpeed >= maxSpeedOf(P0.weapon) * PEEK_SPEED_FRACTION) {
        // Lateral = perpendicular to the line P → E.
        const dx = E0.x - P0.x;
        const dy = E0.y - P0.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const from = frameAt(r, spotTick - s2t(PEEK_BEFORE_S));
        const to = frameAt(r, spotTick + s2t(PEEK_AFTER_S));
        let minLat = Infinity;
        let maxLat = -Infinity;
        let dir0 = 0;
        let reversed = false;
        for (let k = Math.max(0, from); k <= to; k++) {
          const q = r.index[k].get(pId);
          if (!q || !q.isAlive) continue;
          const lat = q.x * nx + q.y * ny;
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
          const lv = q.velX * nx + q.velY * ny;
          if (Math.abs(lv) >= JIGGLE_SPEED) {
            if (dir0 === 0) dir0 = Math.sign(lv);
            else if (Math.sign(lv) !== dir0 && r.frames[k].tick >= spotTick) reversed = true;
          }
        }
        const pFired = pShots.some((s) => s.tick <= spotTick + s2t(PEEK_AFTER_S));
        const eFired = (shotsBy.get(eId) ?? []).some(
          (s) => s.roundNumber === duel.round && s.tick >= spotTick && s.tick <= spotTick + s2t(PEEK_AFTER_S)
        );
        let type: PeekType;
        if (reversed && !pFired) type = eFired ? "shoulder" : "jiggle";
        else if (maxLat - minLat >= WIDE_PEEK_UNITS) type = "wide";
        else type = "tight";

        p.peeks++;
        const t = p.peekTypes[type];
        t.count++;
        if (won) {
          t.won++;
          p.peeksWon++;
        }
        if (lost) t.lost++;

        if (type === "wide" || type === "tight") {
          const team = P0.team;
          const flashed = flashesBy.some(
            (f) =>
              f.roundNumber === duel.round &&
              f.tick >= spotTick - s2t(FLASH_SUPPORT_S) &&
              f.tick <= spotTick + s2t(0.3) &&
              teamOf(duel.round, f.throwerSteamId) === team
          );
          if (!flashed) {
            p.dryPeeks++;
            if (lost) {
              p.dryPeeksLost++;
              addMoment(pId, {
                type: "dry_peek",
                roundNumber: duel.round,
                tick: spotTick,
                roundTime: roundTime(duel.round, spotTick),
                value: Math.round(peekSpeed),
                detail: `${type === "wide" ? "szeroki" : "ciasny"} peek bez flasha, przegrany`,
                costly: true,
                enemy: eId,
              });
            }
          }
        }
      }
    }
  }

  // ── Sprays (bullets 4+ of engagement bursts with automatic guns) ──
  for (const [id, list] of shotsBy) {
    const p = out(id);
    let burst: typeof list = [];
    const flush = () => {
      if (burst.length >= SPRAY_FROM_BULLET && AUTOMATIC.has(burst[0].gun) && burst.some((s) => s.hit)) {
        const tail = burst.slice(SPRAY_FROM_BULLET - 1);
        const hits = tail.filter((s) => s.hit).length;
        p.sprays++;
        p.sprayBullets += tail.length;
        p.sprayHits += hits;
        if (tail.length >= 4 && hits === 0) {
          addMoment(id, {
            type: "spray",
            roundNumber: burst[0].roundNumber,
            tick: burst[0].tick,
            roundTime: roundTime(burst[0].roundNumber, burst[0].tick),
            value: burst.length,
            detail: `${burst.length} kul, żadne trafienie od ${SPRAY_FROM_BULLET}. kuli`,
            costly: false,
          });
        }
      }
      burst = [];
    };
    for (const s of list) {
      const prev = burst[burst.length - 1];
      if (prev && (prev.gun !== s.gun || prev.roundNumber !== s.roundNumber || s.tick - prev.tick > s2t(BURST_GAP_S))) flush();
      burst.push(s);
    }
    flush();

    // Shots in the air.
    for (const s of list) {
      if (Math.abs(s.velZ) <= AIRBORNE_SPEED) continue;
      p.airShots++;
      addMoment(id, {
        type: "air_shot",
        roundNumber: s.roundNumber,
        tick: s.tick,
        roundTime: roundTime(s.roundNumber, s.tick),
        value: Math.round(Math.abs(s.velZ)),
        detail: `strzał w powietrzu (${s.gun})`,
        costly: false,
        weapon: s.gun,
      });
    }
  }

  // ── Noise (running / jumping within earshot of an enemy) ──
  for (const r of rounds.values()) {
    const ids = new Set<string>();
    for (const m of r.index) for (const id of m.keys()) ids.add(id);
    for (const id of ids) {
      let runStart = -1;
      let runEnemy = "";
      // First frame of the run at which the team already knew the enemy: a run
      // is judged by what was known while running, not by spotting that only
      // happened later in it (the part before that was not a mistake).
      let runKnown = -1;
      const flushRun = (endIdx: number) => {
        if (runStart === -1) return;
        const startTick = r.frames[runStart].tick;
        const endTick = r.frames[endIdx].tick;
        if (endTick - startTick >= s2t(NOISE_MIN_S)) {
          const knownTick = runKnown !== -1 && runKnown <= endIdx ? r.frames[runKnown].tick : null;
          const knew = knownTick != null && endTick - knownTick >= s2t(NOISE_MIN_S);
          const costly = anyIn(damageTakenTicks.get(id), startTick, endTick + s2t(COSTLY_AFTER_S));
          if (knew || costly) {
            // A costly run counts from its start; a known-enemy run from the moment it was known.
            const from = costly ? startTick : knownTick!;
            const p = out(id);
            p.noiseEpisodes++;
            if (costly) p.noiseCostly++;
            addMoment(id, {
              type: "noise",
              roundNumber: r.number,
              tick: from,
              roundTime: roundTime(r.number, from),
              value: Math.round(((endTick - from) / tickRate) * 10) / 10,
              detail: costly ? "bieg słyszalny dla wroga, potem trafienie" : "bieg w zasięgu słuchu znanego wroga",
              costly,
              enemy: runEnemy,
            });
          }
        }
        runStart = -1;
        runKnown = -1;
      };
      for (let k = 0; k < r.frames.length; k++) {
        const me = r.index[k].get(id);
        const tick = r.frames[k].tick;
        let near: AimFramePlayer | null = null;
        if (me?.isAlive) {
          for (const o of r.index[k].values()) {
            if (o.team !== me.team && o.isAlive && dist(me, o) <= HEAR_RANGE && (!near || dist(me, o) < dist(me, near))) near = o;
          }
        }
        const noisy =
          !!me && me.isAlive && !!near &&
          speed2d(me) > maxSpeedOf(me.weapon) * NOISY_SPEED_FRACTION &&
          !anyIn(fightTicks.get(id), tick - s2t(IN_FIGHT_S), tick);
        if (noisy) {
          if (runStart === -1) {
            runStart = k;
            runEnemy = near!.steamId;
          }
          if (runKnown === -1 && teamKnew(r, k, me!.team, runEnemy) === true) runKnown = k;
        } else flushRun(Math.max(0, k - 1));

        // Jump take-off.
        const prev = k > 0 ? r.index[k - 1].get(id) : undefined;
        if (me?.isAlive && prev?.isAlive && me.velZ >= JUMP_VZ && Math.abs(prev.velZ) <= AIRBORNE_SPEED) {
          const p = out(id);
          p.jumps++;
          if (near) {
            const knew = teamKnew(r, k, me.team, near.steamId);
            const costly = anyIn(damageTakenTicks.get(id), tick, tick + s2t(COSTLY_AFTER_S));
            if (knew === true || costly) {
              p.jumpsNearEnemy++;
              addMoment(id, {
                type: "jump",
                roundNumber: r.number,
                tick,
                roundTime: roundTime(r.number, tick),
                value: Math.round(dist(me, near)),
                detail: costly ? "skok przy wrogu, potem trafienie" : "zbędny skok w zasięgu słuchu wroga",
                costly,
                enemy: near.steamId,
              });
            }
          }
        }
      }
      flushRun(r.frames.length - 1);
    }
  }

  // ── Reloads ──
  const hasReloads = input.reloads.length > 0;
  for (const rl of input.reloads) {
    const p = out(rl.steamId);
    p.reloads++;
    const r = rounds.get(rl.roundNumber);
    const gun = normalizeWeapon(rl.weapon);
    const hitDuring = anyIn(damageTakenTicks.get(rl.steamId), rl.tick, rl.tick + s2t(RELOAD_RISK_S));
    const diedDuring = input.kills.some(
      (k) => k.victimSteamId === rl.steamId && k.tick >= rl.tick && k.tick <= rl.tick + s2t(RELOAD_RISK_S)
    );
    let early = false;
    let enemy: string | undefined;
    if (r && gun && rl.clip != null && rl.clip >= (MAG_SIZE[gun] ?? 30) * RELOAD_EARLY_FRACTION) {
      const i = frameAt(r, rl.tick);
      const me = r.index[i]?.get(rl.steamId);
      if (me) {
        for (const o of r.index[i].values()) {
          if (o.team === me.team || !o.isAlive || dist(me, o) > RELOAD_DANGER_RANGE) continue;
          if (teamKnew(r, i, me.team, o.steamId)) {
            early = true;
            enemy = o.steamId;
          }
        }
      }
    }
    if (hitDuring || diedDuring || early) {
      p.badReloads++;
      if (hitDuring || diedDuring) {
        enemy =
          enemyDamage.find(
            (d) => d.victimSteamId === rl.steamId && d.tick >= rl.tick && d.tick <= rl.tick + s2t(RELOAD_RISK_S)
          )?.attackerSteamId ?? enemy;
      }
      const mag = gun ? MAG_SIZE[gun] : undefined;
      addMoment(rl.steamId, {
        type: "reload",
        roundNumber: rl.roundNumber,
        tick: rl.tick,
        roundTime: roundTime(rl.roundNumber, rl.tick),
        value: rl.clip ?? -1,
        detail: diedDuring
          ? "śmierć w trakcie przeładowania"
          : hitDuring
            ? "trafiony w trakcie przeładowania"
            : `przeładowanie przy wrogu z ${rl.clip}/${mag ?? "?"} w magazynku`,
        costly: diedDuring || hitDuring,
        enemy,
      });
    }
  }

  // ── Summaries ──
  for (const p of players.values()) {
    p.reloadData = hasReloads;
    const modes = seenModes.get(p.steamId);
    p.visibility = !modes ? (input.rounds.some((r) => rounds.get(r.number)?.hasSpotting) ? "spotted" : "fov") : modes.size > 1 ? "mixed" : [...modes][0];
    const c = crosshairs.get(p.steamId) ?? [];
    p.crosshairSamples = c.length;
    p.crosshairAvgDeg = c.length ? round1(c.reduce((a, b) => a + b, 0) / c.length) : null;
    p.crosshairMedianDeg = c.length ? round1(median(c)) : null;
    const re = reactions.get(p.steamId) ?? [];
    p.reactionSamples = re.length;
    p.reactionMedianMs = re.length ? Math.round(median(re)) : null;
    const t = ttds.get(p.steamId) ?? [];
    p.ttdSamples = t.length;
    p.ttdMedianMs = t.length ? Math.round(median(t)) : null;
    p.moments.sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);
  }

  return [...players.values()].sort((a, b) => b.duels - a.duels);
}

// ─── Metric verdicts (value, threshold, status) ──────────

export type MetricStatus = "good" | "warn" | "bad" | "none";

export interface AimMetric {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  /** Human-readable threshold, e.g. "≤ 8°". */
  threshold: string;
  status: MetricStatus;
  /** Sample size behind the value. */
  samples: number;
  /** Moment type listing the cases behind this metric, if any. */
  moments: AimMomentType | null;
  hint: string;
}

/** Lower is better: good ≤ good, warn ≤ warn, otherwise bad. */
const lower = (v: number | null, good: number, warn: number): MetricStatus =>
  v == null ? "none" : v <= good ? "good" : v <= warn ? "warn" : "bad";
/** Higher is better. */
const higher = (v: number | null, good: number, warn: number): MetricStatus =>
  v == null ? "none" : v >= good ? "good" : v >= warn ? "warn" : "bad";
const share = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : null);

/**
 * Thresholds are starting points from public pro/FPL averages, to be replaced
 * by real pro norms in S13.
 */
export function aimMetrics(s: Omit<PlayerAim, "steamId" | "moments" | "peekTypes" | "visibility">): AimMetric[] {
  const sprayPct = share(s.sprayHits, s.sprayBullets);
  const dryLostPct = share(s.dryPeeksLost, s.dryPeeks);
  const overflickPct = share(s.overflicks, s.flicks + s.overflicks);
  const flickPct = share(s.flicks, s.flicks + s.trackings + s.preaims);
  const preaimPct = share(s.preaims, s.flicks + s.trackings + s.preaims);
  return [
    {
      key: "crosshair", label: "Crosshair placement", value: s.crosshairMedianDeg, unit: "°",
      threshold: "≤ 6° dobrze, > 12° źle", status: lower(s.crosshairMedianDeg, 6, 12),
      samples: s.crosshairSamples, moments: "crosshair",
      hint: "Kąt między celownikiem a głową wroga w chwili, gdy wróg stał się widoczny (mediana).",
    },
    {
      key: "reaction", label: "Czas reakcji", value: s.reactionMedianMs, unit: "ms",
      threshold: "≤ 300 ms dobrze, > 450 ms źle", status: lower(s.reactionMedianMs, 300, 450),
      samples: s.reactionSamples, moments: "reaction",
      hint: "Od pojawienia się wroga do pierwszego ruchu celownika w jego stronę albo strzału.",
    },
    {
      key: "ttd", label: "Time to damage", value: s.ttdMedianMs, unit: "ms",
      threshold: "≤ 600 ms dobrze, > 900 ms źle", status: lower(s.ttdMedianMs, 600, 900),
      samples: s.ttdSamples, moments: null,
      hint: "Od pojawienia się wroga do pierwszych zadanych mu obrażeń.",
    },
    {
      key: "spray", label: "Kontrola sprayu", value: sprayPct, unit: "%",
      threshold: `≥ 30% dobrze, < 18% źle`, status: higher(sprayPct, 30, 18),
      samples: s.sprayBullets, moments: "spray",
      hint: `Trafienia kulami od ${SPRAY_FROM_BULLET}. w seriach, które trafiły wroga.`,
    },
    {
      key: "preaim", label: "Trafienia z pre-aimu", value: preaimPct, unit: "%",
      threshold: "≥ 40% dobrze, < 20% źle", status: higher(preaimPct, 40, 20),
      samples: s.flicks + s.trackings + s.preaims, moments: null,
      hint: `Pierwsze trafienie bez dużej korekty (≤ ${PREAIM_DEG}°). Reszta: flick ${flickPct ?? "–"}%, tracking.`,
    },
    {
      key: "overflick", label: "Overflick", value: overflickPct, unit: "%",
      threshold: "≤ 25% dobrze, > 40% źle", status: lower(overflickPct, 25, 40),
      samples: s.flicks + s.overflicks, moments: "overflick",
      hint: `Flick, który minął głowę o co najmniej ${OVERFLICK_DEG}° i wymagał poprawki.`,
    },
    {
      key: "dry_peek", label: "Przegrane suche peeki", value: dryLostPct, unit: "%",
      threshold: "≤ 40% dobrze, > 60% źle", status: lower(dryLostPct, 40, 60),
      samples: s.dryPeeks, moments: "dry_peek",
      hint: `Peek na wroga bez flasha kolegi w ostatnich ${FLASH_SUPPORT_S} s, zakończony twoją śmiercią.`,
    },
    {
      key: "noise", label: "Bieg przy wrogu", value: s.noiseEpisodes, unit: "",
      threshold: "0–7 dobrze, > 14 źle", status: lower(s.noiseEpisodes, 7, 14),
      samples: s.noiseEpisodes, moments: "noise",
      hint: `Bieg (kroki słychać) w zasięgu ${HEAR_RANGE} jednostek od wroga, o którym team wiedział. ${s.noiseCostly} skończyło się trafieniem.`,
    },
    {
      key: "jump", label: "Zbędne skoki", value: s.jumpsNearEnemy, unit: "",
      threshold: "0–3 dobrze, > 6 źle", status: lower(s.jumpsNearEnemy, 3, 6),
      samples: s.jumps, moments: "jump",
      hint: `Skoki w zasięgu słuchu wroga (lądowanie słychać). Wszystkich skoków: ${s.jumps}, strzałów w powietrzu: ${s.airShots}.`,
    },
    {
      key: "reload", label: "Reload w złym momencie", value: s.reloadData ? s.badReloads : null, unit: "",
      threshold: "0–3 dobrze, > 6 źle", status: s.reloadData ? lower(s.badReloads, 3, 6) : "none",
      samples: s.reloads, moments: "reload",
      hint: s.reloadData
        ? "Trafiony lub zabity w trakcie przeładowania albo przeładowanie z pełnym w połowie magazynkiem przy znanym wrogu."
        : "Brak danych o przeładowaniach dla tego meczu (mecz analizowany przed S9).",
    },
  ];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
