/**
 * Mechanics 1: movement while shooting, counter-strafe timing, first-bullet
 * accuracy and HS% per weapon.
 *
 * Pure module (no parser, no DB) — inputs are the stored ShotEvent /
 * DamageEvent rows plus decoded RoundTicks frames, so it runs after the .dem is
 * gone and is covered by `npm run test:mechanics`.
 *
 * Definitions:
 * - A shot is "moving" when the shooter's horizontal speed at the weapon_fire
 *   tick is above the weapon's accuracy threshold (34% of its max speed, the
 *   point where CS2 adds movement inaccuracy), or the shooter is airborne.
 * - Shots by one player with the same weapon at most BURST_GAP_S apart form a
 *   burst. Its first shot is the "first shot", the rest are "spray".
 * - A burst is an engagement when the shooter hit an enemy during it, or an
 *   enemy hit the shooter shortly before or during it. Shots outside
 *   engagements (spam, prefires into nothing) only count in the "all shots"
 *   totals, never in the headline first-shot / spray numbers.
 * - Counter-strafe time: from the moment the shooter's speed drops below
 *   RUNNING_FRACTION of max speed to the moment it drops below the accuracy
 *   threshold, measured before the first shot of an engagement. Interpolated
 *   between the 4-tick replay frames, with the exact weapon_fire velocity as the
 *   last sample.
 */

/** Weapon max movement speed (units/s, unscoped) — CS2 weapon data. */
export const WEAPON_MAX_SPEED: Record<string, number> = {
  // Pistols
  glock: 240, hkp2000: 240, usp_silencer: 240, p250: 240, elite: 240,
  fiveseven: 240, tec9: 240, cz75a: 240, deagle: 230, revolver: 220,
  // SMGs
  mac10: 240, mp9: 240, mp7: 220, mp5sd: 235, ump45: 230, p90: 230, bizon: 240,
  // Rifles
  ak47: 215, m4a1: 225, m4a1_silencer: 225, galilar: 215, famas: 220,
  sg556: 210, aug: 220,
  // Snipers
  awp: 200, ssg08: 230, scar20: 215, g3sg1: 215,
  // Heavy
  nova: 220, xm1014: 215, mag7: 225, sawedoff: 210, m249: 195, negev: 150,
};

/** Movement inaccuracy starts above this share of the weapon's max speed. */
export const ACCURATE_SPEED_FRACTION = 0.34;
/** Above this share of max speed the player counts as running (start of a stop). */
export const RUNNING_FRACTION = 0.6;
/** Shots further apart than this start a new burst. */
export const BURST_GAP_S = 0.35;
/** An enemy hit on the shooter this long before a burst makes it an engagement. */
export const ENGAGEMENT_LOOKBACK_S = 2;
/** How far back to look for the start of a counter-strafe. */
export const STRAFE_LOOKBACK_S = 1;
/** Vertical speed above which the shooter is in the air (jumping / falling). */
export const AIRBORNE_SPEED = 30;
/** player_hurt may land a few ticks after weapon_fire (sub-tick). */
const HIT_WINDOW_TICKS = 4;
/** Cap on stored moments per player, to bound the row size. */
export const MAX_MOMENTS = 150;

/** Bump when the analysis changes, so stored stats are recomputed. */
export const MECHANICS_VERSION = 1;

/** "weapon_ak47" / "AK47" → "ak47". Returns null for non-guns. */
export function normalizeWeapon(raw: string): string | null {
  const w = raw.toLowerCase().replace(/^weapon_/, "");
  if (w === "m4a4") return "m4a1";
  if (w === "usp" || w === "usp_s") return "usp_silencer";
  if (w === "m4a1_s") return "m4a1_silencer";
  if (w === "p2000") return "hkp2000";
  if (w === "glock18" || w === "glock-18") return "glock";
  return w in WEAPON_MAX_SPEED ? w : null;
}

export function accurateSpeed(weapon: string): number {
  return Math.round((WEAPON_MAX_SPEED[weapon] ?? 250) * ACCURATE_SPEED_FRACTION);
}

// ─── Inputs ──────────────────────────────────────────────

export interface ShotInput {
  tick: number;
  roundNumber: number;
  steamId: string;
  weapon: string;
  velX: number;
  velY: number;
  velZ: number;
}

export interface DamageInput {
  tick: number;
  roundNumber: number;
  attackerSteamId: string | null;
  victimSteamId: string;
  weapon: string;
  hitgroup: string;
}

/** One replay frame — a subset of ReplayFrame from round-ticks.ts. */
export interface FrameInput {
  tick: number;
  players: Array<{ steamId: string; team: "CT" | "T"; velX: number; velY: number; isAlive: boolean }>;
}

export interface MovementInput {
  tickRate: number;
  rounds: Array<{ number: number; startTick: number; frames: FrameInput[] }>;
  shots: ShotInput[];
  damages: DamageInput[];
}

// ─── Outputs ─────────────────────────────────────────────

export interface WeaponMechanics {
  weapon: string;
  shots: number;
  movingShots: number;
  firstShots: number;
  firstShotsMoving: number;
  firstShotHits: number;
  hits: number;
  headHits: number;
}

export interface MovementMoment {
  roundNumber: number;
  tick: number;
  /** Seconds since round start (freeze time included). */
  roundTime: number;
  weapon: string;
  speed: number;
  threshold: number;
  airborne: boolean;
  hit: boolean;
  /** Counter-strafe that was still in progress when the shot went off. */
  strafeMs: number | null;
}

export interface PlayerMechanics {
  steamId: string;
  shots: number;
  movingShots: number;
  firstShots: number;
  firstShotsMoving: number;
  firstShotHits: number;
  sprayShots: number;
  sprayShotsMoving: number;
  sprayHits: number;
  hits: number;
  headHits: number;
  counterStrafes: number;
  counterStrafeAvgMs: number | null;
  counterStrafeMedianMs: number | null;
  /** First shots fired before the stop finished (counter-strafe too slow / none). */
  shotBeforeStop: number;
  weapons: WeaponMechanics[];
  moments: MovementMoment[];
}

// ─── Analysis ────────────────────────────────────────────

interface ShotState extends ShotInput {
  gun: string;
  speed: number;
  airborne: boolean;
  moving: boolean;
  hit: boolean;
  head: boolean;
}

export function analyzeMovement(input: MovementInput): PlayerMechanics[] {
  const { tickRate } = input;
  const roundByNumber = new Map(input.rounds.map((r) => [r.number, r]));

  // Side per round from the replay frames (per-half correct, see CLAUDE.md).
  const teamOf = new Map<string, "CT" | "T">();
  for (const r of input.rounds) {
    for (const f of r.frames) {
      for (const p of f.players) {
        const key = `${r.number}:${p.steamId}`;
        if (!teamOf.has(key)) teamOf.set(key, p.team);
      }
    }
  }
  const isEnemy = (round: number, a: string, b: string) => {
    if (a === b) return false;
    const ta = teamOf.get(`${round}:${a}`);
    const tb = teamOf.get(`${round}:${b}`);
    return !ta || !tb || ta !== tb;
  };

  const shots: ShotState[] = [];
  for (const s of input.shots) {
    const gun = normalizeWeapon(s.weapon);
    if (!gun) continue;
    const speed = Math.hypot(s.velX, s.velY);
    const airborne = Math.abs(s.velZ) > AIRBORNE_SPEED;
    shots.push({
      ...s,
      gun,
      speed,
      airborne,
      moving: airborne || speed > accurateSpeed(gun),
      hit: false,
      head: false,
    });
  }
  shots.sort((a, b) => a.tick - b.tick);

  // Shots per shooter (tick order), for hit matching and bursts.
  const byShooter = new Map<string, ShotState[]>();
  for (const s of shots) {
    const list = byShooter.get(s.steamId) ?? [];
    list.push(s);
    byShooter.set(s.steamId, list);
  }

  // Enemy damage → the shooter's latest shot with that gun at or before it.
  const enemyHitsOn = new Map<string, number[]>(); // victim → ticks hit by an enemy
  for (const d of input.damages) {
    if (!d.attackerSteamId || !isEnemy(d.roundNumber, d.attackerSteamId, d.victimSteamId)) continue;
    const victimHits = enemyHitsOn.get(d.victimSteamId) ?? [];
    victimHits.push(d.tick);
    enemyHitsOn.set(d.victimSteamId, victimHits);

    const gun = normalizeWeapon(d.weapon);
    const list = gun ? byShooter.get(d.attackerSteamId) : undefined;
    if (!list) continue;
    let shot: ShotState | undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].tick > d.tick) continue;
      if (d.tick - list[i].tick > HIT_WINDOW_TICKS) break;
      if (list[i].gun === gun) {
        shot = list[i];
        break;
      }
    }
    if (!shot) continue;
    shot.hit = true;
    if (d.hitgroup.toLowerCase() === "head") shot.head = true;
  }

  const burstGap = BURST_GAP_S * tickRate;
  const results: PlayerMechanics[] = [];

  for (const [steamId, list] of byShooter) {
    const out: PlayerMechanics = {
      steamId,
      shots: 0, movingShots: 0,
      firstShots: 0, firstShotsMoving: 0, firstShotHits: 0,
      sprayShots: 0, sprayShotsMoving: 0, sprayHits: 0,
      hits: 0, headHits: 0,
      counterStrafes: 0, counterStrafeAvgMs: null, counterStrafeMedianMs: null,
      shotBeforeStop: 0,
      weapons: [],
      moments: [],
    };
    const weapons = new Map<string, WeaponMechanics>();
    const strafeTimes: number[] = [];
    const takenHits = enemyHitsOn.get(steamId) ?? [];

    // Split into bursts.
    const bursts: ShotState[][] = [];
    for (const s of list) {
      const cur = bursts[bursts.length - 1];
      const prev = cur?.[cur.length - 1];
      if (prev && prev.gun === s.gun && prev.roundNumber === s.roundNumber && s.tick - prev.tick <= burstGap) {
        cur.push(s);
      } else {
        bursts.push([s]);
      }
    }

    for (const burst of bursts) {
      const first = burst[0];
      const last = burst[burst.length - 1];
      const engaged =
        burst.some((s) => s.hit) ||
        takenHits.some(
          (t) => t >= first.tick - ENGAGEMENT_LOOKBACK_S * tickRate && t <= last.tick + HIT_WINDOW_TICKS
        );

      for (const s of burst) {
        let w = weapons.get(s.gun);
        if (!w) {
          w = {
            weapon: s.gun, shots: 0, movingShots: 0,
            firstShots: 0, firstShotsMoving: 0, firstShotHits: 0, hits: 0, headHits: 0,
          };
          weapons.set(s.gun, w);
        }
        out.shots++;
        w.shots++;
        if (s.moving) {
          out.movingShots++;
          w.movingShots++;
        }
        if (s.hit) {
          out.hits++;
          w.hits++;
          if (s.head) {
            out.headHits++;
            w.headHits++;
          }
        }
        if (!engaged) continue;
        if (s === first) {
          out.firstShots++;
          w.firstShots++;
          if (s.moving) {
            out.firstShotsMoving++;
            w.firstShotsMoving++;
          }
          if (s.hit) {
            out.firstShotHits++;
            w.firstShotHits++;
          }
        } else {
          out.sprayShots++;
          if (s.moving) out.sprayShotsMoving++;
          if (s.hit) out.sprayHits++;
        }
      }

      if (!engaged) continue;
      const round = roundByNumber.get(first.roundNumber);
      const strafe = round ? measureCounterStrafe(first, round.frames, tickRate) : null;
      if (strafe?.kind === "stopped") strafeTimes.push(strafe.ms);
      if (strafe?.kind === "late") out.shotBeforeStop++;

      if (first.moving && out.moments.length < MAX_MOMENTS) {
        out.moments.push({
          roundNumber: first.roundNumber,
          tick: first.tick,
          roundTime: round ? round1((first.tick - round.startTick) / tickRate) : 0,
          weapon: first.gun,
          speed: Math.round(first.speed),
          threshold: accurateSpeed(first.gun),
          airborne: first.airborne,
          hit: first.hit,
          strafeMs: strafe?.kind === "late" ? strafe.ms : null,
        });
      }
    }

    out.counterStrafes = strafeTimes.length;
    if (strafeTimes.length > 0) {
      out.counterStrafeAvgMs = Math.round(strafeTimes.reduce((a, b) => a + b, 0) / strafeTimes.length);
      out.counterStrafeMedianMs = Math.round(median(strafeTimes));
    }
    out.weapons = [...weapons.values()].sort((a, b) => b.shots - a.shots);
    results.push(out);
  }

  return results.sort((a, b) => b.shots - a.shots);
}

export type CounterStrafe =
  /** Was running, stopped below the threshold before shooting; ms = stop duration. */
  | { kind: "stopped"; ms: number }
  /** Was running and fired before reaching the threshold; ms = time spent stopping so far. */
  | { kind: "late"; ms: number };

/**
 * Counter-strafe before `shot`, from the shooter's sampled speed. Returns null
 * when the shooter wasn't running in the lookback window (already still or
 * walking — no stop needed) or has no frames.
 */
export function measureCounterStrafe(
  shot: Pick<ShotInput, "tick" | "steamId" | "velX" | "velY"> & { gun: string },
  frames: FrameInput[],
  tickRate: number
): CounterStrafe | null {
  const maxSpeed = WEAPON_MAX_SPEED[shot.gun] ?? 250;
  const running = maxSpeed * RUNNING_FRACTION;
  const accurate = accurateSpeed(shot.gun);
  const from = shot.tick - STRAFE_LOOKBACK_S * tickRate;

  const series: Array<{ tick: number; speed: number }> = [];
  for (const f of frames) {
    if (f.tick < from || f.tick >= shot.tick) continue;
    const p = f.players.find((pl) => pl.steamId === shot.steamId);
    if (p && p.isAlive) series.push({ tick: f.tick, speed: Math.hypot(p.velX, p.velY) });
  }
  series.push({ tick: shot.tick, speed: Math.hypot(shot.velX, shot.velY) });

  // Last sample at running speed — the stop starts after it.
  let i = -1;
  for (let k = series.length - 1; k >= 0; k--) {
    if (series[k].speed >= running) {
      i = k;
      break;
    }
  }
  if (i === -1) return null;
  if (i === series.length - 1) return { kind: "late", ms: 0 };

  const startTick = crossing(series[i], series[i + 1], running);
  for (let j = i + 1; j < series.length; j++) {
    if (series[j].speed <= accurate) {
      const endTick = crossing(series[j - 1], series[j], accurate);
      return { kind: "stopped", ms: Math.round(((endTick - startTick) / tickRate) * 1000) };
    }
  }
  return { kind: "late", ms: Math.round(((shot.tick - startTick) / tickRate) * 1000) };
}

/** Tick at which speed crosses `level` going down between two samples (linear). */
function crossing(a: { tick: number; speed: number }, b: { tick: number; speed: number }, level: number) {
  if (a.speed === b.speed) return b.tick;
  const t = (a.speed - level) / (a.speed - b.speed);
  return a.tick + Math.min(1, Math.max(0, t)) * (b.tick - a.tick);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Share as a 0–100 percentage, or null when there is nothing to divide. */
export function pct(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}
