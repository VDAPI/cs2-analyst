/**
 * Utility analysis (S11): smokes, flashes, molotovs, HE grenades and grenades
 * left unused at death, per player per match.
 *
 * Pure module (no parser, no DB), covered by `npm run test:utility`. Inputs are
 * the replay data already stored in the DB (RoundTicks frames, GrenadeEvent
 * detonations, grenade throws from ShotEvent, DamageEvent, Kill), so it runs
 * after the .dem is deleted.
 *
 * Judged by what the player could know (see CLAUDE.md): a smoke or molotov
 * is only "wasted" when nobody on the thrower's team had seen an enemy near
 * its landing in the seconds before (game spotting, `spottedBy`), no enemy came
 * into it or behind it while it lasted, and the team did nothing with it.
 *
 * - Smoke: an enemy is "influenced" while standing in/at the smoke or while a
 *   line between his eyes and an alive teammate's passes through it. A void
 *   smoke is "early" when enemies reached the spot within ~30 s after it faded,
 *   or when it went out in the first seconds of the round (the "A main at 1:45
 *   as CT" case); otherwise it is a void smoke.
 * - Flash: who was blinded comes from `flashDuration` on the replay frames
 *   (new value right after the detonation), so teammates count too. A flash
 *   that blinded enemies is "followed" when a teammate saw, hit or killed one
 *   of them while he was blind.
 * - HE / molotov: damage from DamageEvent (enemy vs team) within the
 *   grenade's window; a molotov that hurt nobody still counts when enemies
 *   were at the fire (area denial) or the team knew they were there.
 * - Death with utility: the victim's inventory at death (Kill.victimInventory,
 *   parsed since S11; older matches have none).
 *
 * Changing the analysis means bumping UTILITY_VERSION.
 */

export const UTILITY_VERSION = 1;

/** Smoke lasts ~18 s once it blooms (CS2). */
export const SMOKE_LIFE_S = 18;
/** Smoke cloud radius used for line-of-sight blocking. */
export const SMOKE_RADIUS = 150;
/** An enemy this close (2D) to a smoke/fire is in it or right at it. */
const AT_UTILITY = 450;
/** The team "knew" about an enemy seen this close to the landing… */
const INFO_RANGE = 1100;
/** …within this many seconds before the detonation. */
const INFO_WINDOW_S = 10;
/** A teammate this close to the smoke in the first seconds used it. */
const TEAM_ACTION_RANGE = 700;
const TEAM_ACTION_S = 8;
/** Enemies arriving this long after the smoke faded → it was thrown too early. */
const LATE_ENEMY_WINDOW_S = 30;
/** A void smoke within this many seconds of the freeze-time end is "early". */
export const EARLY_SMOKE_S = 25;
/** Round clock in CS2 competitive (1:55). */
export const ROUND_CLOCK_S = 115;
/** A blind shorter than this barely matters. */
export const BLIND_MIN_S = 1;
/** Flash is "strong" (worth following up) when an enemy is blind this long. */
const STRONG_BLIND_S = 1.5;
/** Molotov / incendiary burn time. */
const FIRE_LIFE_S = 7;
/** Cap on stored moments per type per player, to bound the row size. */
export const MAX_MOMENTS_PER_TYPE = 40;
/** Only deaths at least this far into the round can be blamed for unused utility. */
const DEATH_UTILITY_MIN_LIVE_S = 20;
const EYE = 64;

export type GrenadeKind = "SMOKE" | "FLASH" | "HE" | "MOLOTOV" | "DECOY";

/** Buy price per grenade (CS2), for the value left at death. */
export const GRENADE_PRICE: Record<string, number> = {
  SMOKE: 300,
  FLASH: 200,
  HE: 300,
  MOLOTOV: 400,
  INCENDIARY: 500,
  DECOY: 50,
};

/** "weapon_smokegrenade" / "Smoke Grenade" / "incgrenade" → grenade kind (incendiary = MOLOTOV). */
export function grenadeKind(raw: string): GrenadeKind | null {
  const w = raw.toLowerCase().replace(/^weapon_/, "").replace(/[\s_-]/g, "");
  if (w.includes("smoke")) return "SMOKE";
  if (w.includes("flash")) return "FLASH";
  if (w === "hegrenade" || w.includes("highexplosive") || w === "he") return "HE";
  if (w.includes("molotov") || w.includes("incendiary") || w.includes("incgrenade") || w === "inferno" || w === "firebomb")
    return "MOLOTOV";
  if (w.includes("decoy")) return "DECOY";
  return null;
}

/** Price of one inventory item if it is a grenade (incendiary priced apart from molotov). */
function inventoryGrenade(raw: string): { kind: GrenadeKind; price: number } | null {
  const kind = grenadeKind(raw);
  if (!kind) return null;
  const w = raw.toLowerCase();
  const price = kind === "MOLOTOV" && (w.includes("inc") || w.includes("incendiary")) ? GRENADE_PRICE.INCENDIARY : GRENADE_PRICE[kind];
  return { kind, price };
}

const FIRE_WEAPONS = new Set(["inferno", "molotov", "incgrenade", "firebomb"]);

// ─── Inputs ──────────────────────────────────────────────

export interface UtilityFramePlayer {
  steamId: string;
  team: "CT" | "T";
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  isAlive: boolean;
  /** Blind duration set by the last flash (seconds). */
  flashDuration: number;
  /** Who can see this player; undefined when the round has no spotting data. */
  spottedBy?: string[];
}

export interface UtilityFrame {
  tick: number;
  players: UtilityFramePlayer[];
}

export interface UtilityRound {
  number: number;
  startTick: number;
  endTick: number;
  frames: UtilityFrame[];
}

/** A grenade going off (GrenadeEvent): smoke bloom, flash/HE explosion, fire start. */
export interface UtilityDetonation {
  tick: number;
  roundNumber: number;
  throwerSteamId: string;
  type: GrenadeKind;
  x: number;
  y: number;
  z: number;
}

/** A grenade leaving the hand (weapon_fire of a grenade, stored as a ShotEvent). */
export interface UtilityThrowEvent {
  tick: number;
  roundNumber: number;
  steamId: string;
  weapon: string;
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  velX: number;
  velY: number;
  velZ: number;
}

export interface UtilityDamage {
  tick: number;
  roundNumber: number;
  attackerSteamId: string | null;
  victimSteamId: string;
  weapon: string;
  dmgHealth: number;
}

export interface UtilityKill {
  tick: number;
  roundNumber: number;
  attackerSteamId: string;
  victimSteamId: string;
  /** Item names at death; null when not recorded. */
  victimInventory: string[] | null;
}

export interface UtilityInput {
  tickRate: number;
  rounds: UtilityRound[];
  detonations: UtilityDetonation[];
  throws: UtilityThrowEvent[];
  damages: UtilityDamage[];
  kills: UtilityKill[];
  /** Bomb plants (the round clock stops meaning "time left" after one). */
  plants: Array<{ roundNumber: number; tick: number }>;
}

// ─── Outputs ─────────────────────────────────────────────

export type UtilityMomentType =
  | "smoke_early"
  | "smoke_void"
  | "team_flash"
  | "flash_no_peek"
  | "he_no_effect"
  | "molotov_no_effect"
  | "nade_team_damage"
  | "death_with_utility";

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface UtilityMoment {
  type: UtilityMomentType;
  roundNumber: number;
  tick: number;
  /** Seconds since round start (freeze time included). */
  roundTime: number;
  /** Seconds left on the round clock (1:55 at freeze end); null after a plant. */
  clock: number | null;
  side: "CT" | "T";
  /** Main number of the moment, see `type`. */
  value: number;
  costly: boolean;
  /** Enemy to highlight in the clip (the one who punished it), if any. */
  enemy?: string;
  grenade?: GrenadeKind;
  /** Where the grenade went off. */
  land?: Point3;
  /** Smoke faded this many seconds before an enemy reached the spot. */
  lateBy?: number;
  /** Teammates (or self) blinded / hurt. */
  mates?: string[];
  /** Grenades held at death. */
  held?: GrenadeKind[];
}

export type ThrowTechnique = "stand" | "walk" | "run" | "jump";

/** A throw linked to its detonation: feeds the lineup base (lineups.ts). */
export interface UtilityThrow {
  type: GrenadeKind;
  roundNumber: number;
  side: "CT" | "T";
  throwTick: number;
  detTick: number;
  /** Seconds since round start at the detonation. */
  roundTime: number;
  /** Player origin at the throw (setpos). */
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  technique: ThrowTechnique;
  land: Point3;
}

export interface PlayerUtility {
  steamId: string;
  smokes: number;
  smokesVoid: number;
  smokesEarly: number;
  flashes: number;
  flashesBlinding: number;
  flashesFollowed: number;
  flashEnemySec: number;
  flashTeamSec: number;
  teamFlashes: number;
  hes: number;
  heDamage: number;
  molotovs: number;
  molotovDamage: number;
  nadeTeamDamage: number;
  nadesNoEffect: number;
  deaths: number;
  deathsWithUtility: number;
  unusedUtilityValue: number;
  inventoryData: boolean;
  throws: UtilityThrow[];
  moments: UtilityMoment[];
}

function emptyPlayer(steamId: string): PlayerUtility {
  return {
    steamId,
    smokes: 0, smokesVoid: 0, smokesEarly: 0,
    flashes: 0, flashesBlinding: 0, flashesFollowed: 0, flashEnemySec: 0, flashTeamSec: 0, teamFlashes: 0,
    hes: 0, heDamage: 0, molotovs: 0, molotovDamage: 0, nadeTeamDamage: 0, nadesNoEffect: 0,
    deaths: 0, deathsWithUtility: 0, unusedUtilityValue: 0, inventoryData: false,
    throws: [], moments: [],
  };
}

// ─── Geometry ────────────────────────────────────────────

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from point p to segment ab (3D). */
export function pointSegmentDistance(p: Point3, a: Point3, b: Point3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}

/** Does the line between two players' eyes pass through a smoke centred at c? */
export function smokeBlocksLine(c: Point3, a: Point3, b: Point3): boolean {
  const ea = { x: a.x, y: a.y, z: a.z + EYE };
  const eb = { x: b.x, y: b.y, z: b.z + EYE };
  // Both ends outside the cloud (an enemy inside it is counted separately).
  if (dist2(ea, c) < SMOKE_RADIUS || dist2(eb, c) < SMOKE_RADIUS) return false;
  return pointSegmentDistance(c, ea, eb) <= SMOKE_RADIUS;
}

/** "1:45" from seconds left on the round clock. */
export const fmtClock = (s: number) => {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

// ─── Analysis ────────────────────────────────────────────

interface RoundCtx {
  r: UtilityRound;
  frames: UtilityFrame[];
  index: Array<Map<string, UtilityFramePlayer>>;
  freezeEnd: number;
  plant: number | null;
  hasSpotting: boolean;
}

/** Freeze time ends on the first frame anyone moves (nobody can move during it). */
export function freezeEndTick(frames: UtilityFrame[], fallback: number): number {
  for (const f of frames) {
    if (f.players.some((p) => p.isAlive && Math.hypot(p.velX, p.velY) > 20)) return f.tick;
  }
  return fallback;
}

export function analyzeUtility(input: UtilityInput): PlayerUtility[] {
  const { tickRate } = input;
  const s2t = (s: number) => Math.round(s * tickRate);

  const rounds = new Map<number, RoundCtx>();
  for (const r of input.rounds) {
    const frames = [...r.frames].sort((a, b) => a.tick - b.tick);
    const plantTicks = input.plants.filter((p) => p.roundNumber === r.number).map((p) => p.tick);
    rounds.set(r.number, {
      r,
      frames,
      index: frames.map((f) => new Map(f.players.map((p) => [p.steamId, p]))),
      freezeEnd: freezeEndTick(frames, r.startTick + s2t(15)),
      plant: plantTicks.length ? Math.min(...plantTicks) : null,
      hasSpotting: frames.some((f) => f.players.some((p) => p.spottedBy !== undefined)),
    });
  }

  const players = new Map<string, PlayerUtility>();
  const out = (id: string) => {
    let p = players.get(id);
    if (!p) {
      p = emptyPlayer(id);
      players.set(id, p);
    }
    return p;
  };
  const addMoment = (id: string, m: UtilityMoment) => {
    const p = out(id);
    if (p.moments.filter((x) => x.type === m.type).length < MAX_MOMENTS_PER_TYPE) p.moments.push(m);
  };

  /** Index of the last frame at or before `tick` (−1 if none). */
  const frameAt = (ctx: RoundCtx, tick: number) => {
    let lo = 0, hi = ctx.frames.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ctx.frames[mid].tick <= tick) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };
  /** Frame indices with from ≤ tick ≤ to. */
  const framesIn = (ctx: RoundCtx, from: number, to: number) => {
    const idx: number[] = [];
    let i = Math.max(0, frameAt(ctx, from));
    if (ctx.frames[i] && ctx.frames[i].tick < from) i++;
    for (; i < ctx.frames.length && ctx.frames[i].tick <= to; i++) idx.push(i);
    return idx;
  };
  const sideAt = (ctx: RoundCtx, id: string, tick: number): "CT" | "T" | undefined => {
    const i = frameAt(ctx, tick);
    const p = ctx.index[Math.max(0, i)]?.get(id);
    if (p) return p.team;
    for (const m of ctx.index) {
      const q = m.get(id);
      if (q) return q.team;
    }
    return undefined;
  };
  const roundTime = (ctx: RoundCtx, tick: number) => Math.round(((tick - ctx.r.startTick) / tickRate) * 10) / 10;
  const liveTime = (ctx: RoundCtx, tick: number) => (tick - ctx.freezeEnd) / tickRate;
  const clockAt = (ctx: RoundCtx, tick: number): number | null => {
    if (ctx.plant != null && tick >= ctx.plant) return null;
    const left = ROUND_CLOCK_S - liveTime(ctx, tick);
    return left >= 0 && left <= ROUND_CLOCK_S ? Math.round(left) : null;
  };
  /** Did someone on `side` (other than nobody) see an enemy near `at` in [from, to]? */
  const teamKnewEnemyNear = (ctx: RoundCtx, side: "CT" | "T", at: Point3, from: number, to: number, range: number) => {
    for (const i of framesIn(ctx, from, to)) {
      for (const e of ctx.frames[i].players) {
        if (!e.isAlive || e.team === side || dist2(e, at) > range) continue;
        // Without spotting data we can't tell what the team saw: assume they knew.
        if (!ctx.hasSpotting) return true;
        if (e.spottedBy?.some((id) => ctx.index[i].get(id)?.team === side)) return true;
      }
    }
    return false;
  };

  // ── Throws → detonations (lineup base) ──
  const throwsBy = new Map<string, UtilityThrowEvent[]>();
  for (const t of input.throws) {
    const kind = grenadeKind(t.weapon);
    if (!kind) continue;
    const key = `${t.steamId}|${kind}`;
    const list = throwsBy.get(key) ?? [];
    list.push(t);
    throwsBy.set(key, list);
  }
  for (const list of throwsBy.values()) list.sort((a, b) => a.tick - b.tick);
  const usedThrows = new Set<UtilityThrowEvent>();
  const throwFor = (d: UtilityDetonation) => {
    const list = throwsBy.get(`${d.throwerSteamId}|${d.type}`) ?? [];
    let best: UtilityThrowEvent | null = null;
    for (const t of list) {
      if (t.tick > d.tick) break;
      if (usedThrows.has(t) || d.tick - t.tick > s2t(20)) continue;
      best = t;
    }
    if (best) usedThrows.add(best);
    return best;
  };

  const detonations = [...input.detonations].sort((a, b) => a.tick - b.tick);

  for (const d of detonations) {
    const ctx = rounds.get(d.roundNumber);
    if (!ctx || ctx.frames.length === 0) continue;
    const side = sideAt(ctx, d.throwerSteamId, d.tick);
    if (!side) continue;
    const p = out(d.throwerSteamId);
    const land: Point3 = { x: d.x, y: d.y, z: d.z };

    const thr = throwFor(d);
    if (thr && d.type !== "DECOY") {
      const speed = Math.hypot(thr.velX, thr.velY);
      p.throws.push({
        type: d.type,
        roundNumber: d.roundNumber,
        side,
        throwTick: thr.tick,
        detTick: d.tick,
        roundTime: roundTime(ctx, d.tick),
        x: Math.round(thr.x * 100) / 100,
        y: Math.round(thr.y * 100) / 100,
        z: Math.round(thr.z * 100) / 100,
        pitch: Math.round(thr.pitch * 100) / 100,
        yaw: Math.round(thr.yaw * 100) / 100,
        technique: Math.abs(thr.velZ) > 50 ? "jump" : speed > 150 ? "run" : speed > 20 ? "walk" : "stand",
        land,
      });
    }

    const base = {
      roundNumber: d.roundNumber,
      tick: d.tick,
      roundTime: roundTime(ctx, d.tick),
      clock: clockAt(ctx, d.tick),
      side,
      grenade: d.type,
      land,
    };

    if (d.type === "SMOKE") {
      p.smokes++;
      analyzeSmoke(ctx, d, side, land, base);
    } else if (d.type === "FLASH") {
      p.flashes++;
      analyzeFlash(ctx, d, side, base);
    } else if (d.type === "HE" || d.type === "MOLOTOV") {
      analyzeNade(ctx, d, side, land, base);
    }
  }

  function influencedAt(ctx: RoundCtx, i: number, side: "CT" | "T", c: Point3, lineOfSight: boolean): string | null {
    const f = ctx.frames[i];
    const mates = f.players.filter((q) => q.isAlive && q.team === side);
    for (const e of f.players) {
      if (!e.isAlive || e.team === side) continue;
      if (dist2(e, c) <= AT_UTILITY && Math.abs(e.z - c.z) < 250) return e.steamId;
      if (lineOfSight && mates.some((m) => dist2(m, e) < 3500 && smokeBlocksLine(c, m, e))) return e.steamId;
    }
    return null;
  }

  function analyzeSmoke(
    ctx: RoundCtx,
    d: UtilityDetonation,
    side: "CT" | "T",
    land: Point3,
    base: Omit<UtilityMoment, "type" | "value" | "costly">
  ) {
    const p = out(d.throwerSteamId);
    const c = { x: land.x, y: land.y, z: land.z + 60 };
    const fade = d.tick + s2t(SMOKE_LIFE_S);
    const life = framesIn(ctx, d.tick, Math.min(fade, ctx.r.endTick));
    // Every other frame (8/s) is plenty for "was anyone behind it".
    if (life.some((i, k) => k % 2 === 0 && influencedAt(ctx, i, side, c, true) != null)) return;
    if (teamKnewEnemyNear(ctx, side, land, d.tick - s2t(INFO_WINDOW_S), d.tick, INFO_RANGE)) return;
    const teamUsed = framesIn(ctx, d.tick, d.tick + s2t(TEAM_ACTION_S)).some((i) =>
      ctx.frames[i].players.some((q) => q.isAlive && q.team === side && dist2(q, land) <= TEAM_ACTION_RANGE)
    );
    if (teamUsed) return;

    p.smokesVoid++;
    // Did enemies come to the spot after it faded? Then it was thrown too early.
    let late: { tick: number; enemy: string } | null = null;
    for (const i of framesIn(ctx, fade, Math.min(ctx.r.endTick, fade + s2t(LATE_ENEMY_WINDOW_S)))) {
      const e = influencedAt(ctx, i, side, c, false);
      if (e) {
        late = { tick: ctx.frames[i].tick, enemy: e };
        break;
      }
    }
    const live = liveTime(ctx, d.tick);
    if (late) {
      const lateBy = Math.round(((late.tick - fade) / tickRate) * 10) / 10;
      p.smokesEarly++;
      addMoment(d.throwerSteamId, {
        ...base,
        type: "smoke_early",
        value: lateBy,
        lateBy,
        costly: true,
        enemy: late.enemy,
      });
    } else if (live <= EARLY_SMOKE_S) {
      p.smokesEarly++;
      addMoment(d.throwerSteamId, { ...base, type: "smoke_early", value: Math.round(live), costly: false });
    } else {
      addMoment(d.throwerSteamId, { ...base, type: "smoke_void", value: SMOKE_LIFE_S, costly: false });
    }
  }

  function analyzeFlash(
    ctx: RoundCtx,
    d: UtilityDetonation,
    side: "CT" | "T",
    base: Omit<UtilityMoment, "type" | "value" | "costly">
  ) {
    const p = out(d.throwerSteamId);
    const bi = frameAt(ctx, d.tick - 1);
    const ai = framesIn(ctx, d.tick, d.tick + 12)[0];
    if (ai == null) return;
    // Another flash going off at the same moment makes the blind ambiguous.
    const ambiguous = input.detonations.some(
      (o) => o !== d && o.type === "FLASH" && o.roundNumber === d.roundNumber && Math.abs(o.tick - d.tick) <= 12
    );
    const blinded: Array<{ q: UtilityFramePlayer; dur: number }> = [];
    for (const q of ctx.frames[ai].players) {
      if (!q.isAlive) continue;
      const before = bi >= 0 ? ctx.index[bi].get(q.steamId)?.flashDuration ?? 0 : 0;
      if (q.flashDuration >= 0.3 && Math.abs(q.flashDuration - before) > 0.05) blinded.push({ q, dur: q.flashDuration });
    }
    const enemies = blinded.filter((b) => b.q.team !== side);
    const mates = blinded.filter((b) => b.q.team === side);
    const enemySec = enemies.reduce((s, b) => s + b.dur, 0);
    const mateSec = mates.reduce((s, b) => s + b.dur, 0);
    p.flashEnemySec += enemySec;
    p.flashTeamSec += mateSec;
    if (mates.some((b) => b.dur >= BLIND_MIN_S)) p.teamFlashes++;

    const strong = enemies.filter((b) => b.dur >= BLIND_MIN_S);
    if (strong.length > 0) {
      p.flashesBlinding++;
      // Was any blinded enemy seen, hit or killed by the team while blind?
      const followed = strong.some((b) => {
        const until = d.tick + s2t(b.dur + 0.3);
        const hit =
          input.damages.some(
            (x) =>
              x.victimSteamId === b.q.steamId && x.tick >= d.tick && x.tick <= until &&
              x.attackerSteamId != null && sideAt(ctx, x.attackerSteamId, x.tick) === side
          ) ||
          input.kills.some(
            (k) => k.victimSteamId === b.q.steamId && k.tick >= d.tick && k.tick <= until && sideAt(ctx, k.attackerSteamId, k.tick) === side
          );
        if (hit) return true;
        if (!ctx.hasSpotting) return false;
        return framesIn(ctx, d.tick, until).some((i) =>
          ctx.index[i].get(b.q.steamId)?.spottedBy?.some((id) => ctx.index[i].get(id)?.team === side)
        );
      });
      if (followed) p.flashesFollowed++;
      else if (!ambiguous && strong.some((b) => b.dur >= STRONG_BLIND_S)) {
        addMoment(d.throwerSteamId, {
          ...base,
          type: "flash_no_peek",
          value: Math.round(enemySec * 10) / 10,
          costly: false,
          enemy: strong[0].q.steamId,
        });
      }
    }

    if (ambiguous) return;
    const maxMate = Math.max(0, ...mates.map((b) => b.dur));
    if (mateSec >= 1.2 || maxMate >= BLIND_MIN_S) {
      // Punished: a blinded teammate got hit or killed while blind.
      let punisher: string | undefined;
      for (const b of mates) {
        const until = d.tick + s2t(b.dur + 0.5);
        const hit = input.damages.find(
          (x) =>
            x.victimSteamId === b.q.steamId && x.tick >= d.tick && x.tick <= until &&
            x.attackerSteamId != null && sideAt(ctx, x.attackerSteamId, x.tick) !== side
        );
        if (hit?.attackerSteamId) {
          punisher = hit.attackerSteamId;
          break;
        }
      }
      addMoment(d.throwerSteamId, {
        ...base,
        type: "team_flash",
        value: Math.round(mateSec * 10) / 10,
        costly: punisher != null,
        enemy: punisher,
        mates: mates.map((b) => b.q.steamId),
      });
    }
  }

  function analyzeNade(
    ctx: RoundCtx,
    d: UtilityDetonation,
    side: "CT" | "T",
    land: Point3,
    base: Omit<UtilityMoment, "type" | "value" | "costly">
  ) {
    const p = out(d.throwerSteamId);
    const fire = d.type === "MOLOTOV";
    const from = d.tick - 8;
    const to = d.tick + (fire ? s2t(FIRE_LIFE_S) : 16);
    let enemyDmg = 0;
    let teamDmg = 0;
    const hurtMates = new Set<string>();
    for (const x of input.damages) {
      if (x.attackerSteamId !== d.throwerSteamId || x.tick < from || x.tick > to) continue;
      const w = x.weapon.toLowerCase().replace(/^weapon_/, "");
      if (fire ? !FIRE_WEAPONS.has(w) : w !== "hegrenade") continue;
      const vs = sideAt(ctx, x.victimSteamId, x.tick);
      if (vs === side) {
        if (x.victimSteamId !== d.throwerSteamId) {
          teamDmg += x.dmgHealth;
          hurtMates.add(x.victimSteamId);
        }
      } else enemyDmg += x.dmgHealth;
    }
    if (fire) {
      p.molotovs++;
      p.molotovDamage += enemyDmg;
    } else {
      p.hes++;
      p.heDamage += enemyDmg;
    }
    p.nadeTeamDamage += teamDmg;

    if (teamDmg >= 20) {
      addMoment(d.throwerSteamId, {
        ...base,
        type: "nade_team_damage",
        value: teamDmg,
        costly: teamDmg >= 50,
        mates: [...hurtMates],
      });
    }
    if (enemyDmg > 0) return;

    // No damage. A fire still worked if enemies stood at it (denied the area)…
    const window = framesIn(ctx, d.tick, Math.min(to, ctx.r.endTick));
    if (fire && window.some((i) => influencedAt(ctx, i, side, land, false) != null)) return;
    // …and either grenade was a fair call if the team knew enemies were there.
    const knew = teamKnewEnemyNear(ctx, side, land, d.tick - s2t(fire ? INFO_WINDOW_S : 4), d.tick, fire ? INFO_RANGE : 600);
    if (fire && knew) return;
    p.nadesNoEffect++;
    // Nearest enemy at the detonation, for the card.
    const fi = frameAt(ctx, d.tick);
    const nearest = (ctx.frames[Math.max(0, fi)]?.players ?? [])
      .filter((e) => e.isAlive && e.team !== side)
      .sort((a, b) => dist2(a, land) - dist2(b, land))[0];
    addMoment(d.throwerSteamId, {
      ...base,
      type: fire ? "molotov_no_effect" : "he_no_effect",
      value: nearest ? Math.round(dist2(nearest, land)) : -1,
      // An HE thrown at an enemy the team had just seen, that missed.
      costly: !fire && knew,
      enemy: nearest?.steamId,
    });
  }

  // ── Deaths with utility in the pocket ──
  for (const k of input.kills) {
    if (!k.victimInventory) continue;
    const ctx = rounds.get(k.roundNumber);
    if (!ctx) continue;
    const p = out(k.victimSteamId);
    p.inventoryData = true;
    p.deaths++;
    const held = k.victimInventory.map(inventoryGrenade).filter((g): g is { kind: GrenadeKind; price: number } => g != null);
    const useful = held.filter((g) => g.kind !== "DECOY");
    if (useful.length === 0) continue;
    const value = useful.reduce((s, g) => s + g.price, 0);
    p.deathsWithUtility++;
    p.unusedUtilityValue += value;
    if (useful.length >= 2 && liveTime(ctx, k.tick) >= DEATH_UTILITY_MIN_LIVE_S) {
      const side = sideAt(ctx, k.victimSteamId, k.tick - 1);
      if (!side) continue;
      addMoment(k.victimSteamId, {
        type: "death_with_utility",
        roundNumber: k.roundNumber,
        tick: k.tick,
        roundTime: roundTime(ctx, k.tick),
        clock: clockAt(ctx, k.tick),
        side,
        value,
        costly: true,
        enemy: k.attackerSteamId !== k.victimSteamId ? k.attackerSteamId : undefined,
        held: useful.map((g) => g.kind),
      });
    }
  }

  for (const p of players.values()) {
    p.flashEnemySec = Math.round(p.flashEnemySec * 10) / 10;
    p.flashTeamSec = Math.round(p.flashTeamSec * 10) / 10;
    p.moments.sort((a, b) => a.roundNumber - b.roundNumber || a.tick - b.tick);
  }
  return [...players.values()].sort((a, b) => a.steamId.localeCompare(b.steamId));
}

// ─── Match metrics (report) ──────────────────────────────

export type UtilitySummary = Omit<PlayerUtility, "steamId" | "throws" | "moments">;
