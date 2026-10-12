/**
 * Lineup base (S11): grenade throws that players repeat from the same spot,
 * with the same angles, landing in the same place — learned from every
 * analysed match on a map (UtilityStats.throws), later also from pro demos.
 *
 * - `buildLineups` clusters throws by type, technique, origin (±24 u), view
 *   angles (±1.5°) and landing (±90 u); a cluster seen often enough, in more
 *   than one match, is a lineup.
 * - `matchLineup` recognises a throw as one of them.
 * - `suggestLineup` finds the lineup a player was probably going for when his
 *   own smoke/molotov landed off the usual spot.
 * - Names come from the game's callouts (`last_place_name`, see places.ts):
 *   "Smoke Window · z T Spawn".
 *
 * Pure module, covered by `npm run test:utility`.
 */
import type { GrenadeKind, Point3, ThrowTechnique, UtilityThrow } from "./utility";

/** Throws must start this close to the cluster's origin (units)… */
const ORIGIN_TOL = 24;
/** …with the view this close (degrees)… */
const ANGLE_TOL = 1.5;
/** …and land this close (2D units). */
const LAND_TOL = 90;
/** A lineup needs this many throws… */
export const LINEUP_MIN_SAMPLES = 3;
/** …from at least this many matches. */
export const LINEUP_MIN_MATCHES = 2;
/** A known lineup lands within this distance of a throw → it was the target. */
const TARGET_RANGE = 350;
/** Landing this far from the lineup's spot is worth a hint. */
export const LINEUP_MISS_MIN = 110;

export interface LineupThrow extends UtilityThrow {
  matchId: string;
  steamId: string;
}

export interface Lineup {
  /** Stable id: type, technique and rounded origin/landing. */
  key: string;
  type: GrenadeKind;
  technique: ThrowTechnique;
  side: "CT" | "T" | "both";
  /** Mean throw origin and view angles (setpos / setang). */
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  land: Point3;
  samples: number;
  matches: number;
  players: number;
  /** Callout of the landing / of the throw spot, when known. */
  landPlace: string | null;
  throwPlace: string | null;
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const d2 = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

interface Cluster {
  type: GrenadeKind;
  technique: ThrowTechnique;
  members: LineupThrow[];
  x: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  land: Point3;
}

function fits(c: { x: number; y: number; z: number; pitch: number; yaw: number; land: Point3 }, t: UtilityThrow): boolean {
  return (
    Math.hypot(c.x - t.x, c.y - t.y, c.z - t.z) <= ORIGIN_TOL &&
    Math.abs(wrap(c.yaw - t.yaw)) <= ANGLE_TOL &&
    Math.abs(c.pitch - t.pitch) <= ANGLE_TOL &&
    d2(c.land, t.land) <= LAND_TOL
  );
}

function recentre(c: Cluster) {
  const n = c.members.length;
  const mean = (f: (t: LineupThrow) => number) => c.members.reduce((s, t) => s + f(t), 0) / n;
  c.x = mean((t) => t.x);
  c.y = mean((t) => t.y);
  c.z = mean((t) => t.z);
  c.pitch = mean((t) => t.pitch);
  // Yaw around the first member, so -179/179 average to 180, not 0.
  const y0 = c.members[0].yaw;
  c.yaw = wrap(y0 + mean((t) => wrap(t.yaw - y0)));
  c.land = { x: mean((t) => t.land.x), y: mean((t) => t.land.y), z: mean((t) => t.land.z) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function buildLineups(
  throws: LineupThrow[],
  placeOf: (p: Point3) => string | null = () => null
): Lineup[] {
  const clusters: Cluster[] = [];
  // Only grenades thrown on purpose to a spot: smokes, flashes, molotovs, HEs.
  const sorted = [...throws].sort((a, b) => a.matchId.localeCompare(b.matchId) || a.throwTick - b.throwTick);
  for (const t of sorted) {
    const c = clusters.find((k) => k.type === t.type && k.technique === t.technique && fits(k, t));
    if (c) {
      c.members.push(t);
      recentre(c);
    } else {
      clusters.push({ type: t.type, technique: t.technique, members: [t], x: t.x, y: t.y, z: t.z, pitch: t.pitch, yaw: t.yaw, land: t.land });
    }
  }
  const out: Lineup[] = [];
  for (const c of clusters) {
    const matches = new Set(c.members.map((m) => m.matchId)).size;
    if (c.members.length < LINEUP_MIN_SAMPLES || matches < LINEUP_MIN_MATCHES) continue;
    const sides = new Set(c.members.map((m) => m.side));
    const land = { x: Math.round(c.land.x), y: Math.round(c.land.y), z: Math.round(c.land.z) };
    out.push({
      key: `${c.type}:${c.technique}:${Math.round(c.x / 16)}:${Math.round(c.y / 16)}:${Math.round(land.x / 64)}:${Math.round(land.y / 64)}`,
      type: c.type,
      technique: c.technique,
      side: sides.size === 1 ? [...sides][0] : "both",
      x: r2(c.x),
      y: r2(c.y),
      z: r2(c.z),
      pitch: r2(c.pitch),
      yaw: r2(c.yaw),
      land,
      samples: c.members.length,
      matches,
      players: new Set(c.members.map((m) => m.steamId)).size,
      landPlace: placeOf(land),
      throwPlace: placeOf({ x: c.x, y: c.y, z: c.z }),
    });
  }
  return out.sort((a, b) => b.samples - a.samples || a.key.localeCompare(b.key));
}

/** The lineup this throw is, if any. */
export function matchLineup(t: UtilityThrow, lineups: Lineup[]): Lineup | null {
  return lineups.find((l) => l.type === t.type && l.technique === t.technique && fits(l, t)) ?? null;
}

/**
 * The lineup the player was probably going for: same grenade, landing near
 * his, but his landed at least LINEUP_MISS_MIN away from the lineup's spot.
 */
export function suggestLineup(t: UtilityThrow, lineups: Lineup[]): { lineup: Lineup; offBy: number } | null {
  if (matchLineup(t, lineups)) return null;
  let best: { lineup: Lineup; offBy: number } | null = null;
  for (const l of lineups) {
    if (l.type !== t.type || (l.side !== "both" && l.side !== t.side)) continue;
    if (Math.abs(l.land.z - t.land.z) > 200) continue;
    const off = d2(l.land, t.land);
    if (off > TARGET_RANGE) continue;
    if (!best || off < best.offBy) best = { lineup: l, offBy: Math.round(off) };
  }
  return best && best.offBy >= LINEUP_MISS_MIN ? best : null;
}

/** Console commands that put you on the lineup (sv_cheats 1). */
export function setposCommand(l: Pick<Lineup, "x" | "y" | "z" | "pitch" | "yaw">): string {
  return `setpos ${l.x.toFixed(2)} ${l.y.toFixed(2)} ${l.z.toFixed(2)};setang ${l.pitch.toFixed(2)} ${l.yaw.toFixed(2)} 0`;
}

const TYPE_NAME: Record<GrenadeKind, string> = {
  SMOKE: "Smoke",
  FLASH: "Flash",
  HE: "HE",
  MOLOTOV: "Molotov",
  DECOY: "Decoy",
};

/** "Smoke Window · z T Spawn" (or "Smoke #3" without callouts). */
export function lineupName(l: Pick<Lineup, "type" | "landPlace" | "throwPlace">, fallbackIndex?: number): string {
  const head = `${TYPE_NAME[l.type]} ${l.landPlace ?? (fallbackIndex != null ? `#${fallbackIndex + 1}` : "")}`.trim();
  return l.throwPlace && l.throwPlace !== l.landPlace ? `${head} · z ${l.throwPlace}` : head;
}
