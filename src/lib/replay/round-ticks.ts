/**
 * Compact storage format for sampled per-round player state (RoundTicks).
 *
 * The 2D replay used to parse the .dem on every request, which breaks as soon
 * as the demo is deleted after analysis. Instead the parse worker samples every
 * REPLAY_SAMPLE_INTERVAL ticks once and stores each round as one blob:
 *
 *   data = gzip( Int16LE[ player ][ column ][ frame ] )
 *
 * Each (player, column) run is delta-encoded with wrapping Int16 arithmetic, so
 * slowly changing values (position, HP, weapon) become long runs of small
 * numbers that gzip squeezes well, and decoding is exactly lossless for any
 * value that fits Int16. Quantisation is per column (see COLUMNS): positions
 * are whole units, angles are 1/100 degree.
 *
 * A player with no row on a frame (not connected, spectating) is stored with
 * team 0 and is left out of that frame on decode.
 *
 * Pure module — no parser, no DB — so it is covered by `npm run test:replay`.
 */
import { gunzipSync, gzipSync } from "zlib";

/** Ticks between stored frames. 4 ticks = 16 frames/s on 64-tick demos. */
export const REPLAY_SAMPLE_INTERVAL = 4;

export const REPLAY_FORMAT_VERSION = 1;

/** demoparser2 props needed to build a RoundTicks blob. */
export const REPLAY_TICK_PROPS = [
  "X",
  "Y",
  "Z",
  "velocity_X",
  "velocity_Y",
  "velocity_Z",
  "pitch",
  "yaw",
  "health",
  "armor_value",
  "is_alive",
  "team_num",
  "active_weapon_name",
  "flash_duration",
];

type TickRow = Record<string, unknown>;

type ColumnKey = Exclude<keyof ReplaySample, "steamId" | "name">;

interface Column {
  key: ColumnKey;
  /** Stored value = round(raw * scale). */
  scale: number;
  read: (row: TickRow, weaponIndex: (name: string) => number) => number;
}

const COLUMNS: Column[] = [
  { key: "x", scale: 1, read: (r) => num(r.X) },
  { key: "y", scale: 1, read: (r) => num(r.Y) },
  { key: "z", scale: 1, read: (r) => num(r.Z) },
  { key: "velX", scale: 1, read: (r) => num(r.velocity_X) },
  { key: "velY", scale: 1, read: (r) => num(r.velocity_Y) },
  { key: "velZ", scale: 1, read: (r) => num(r.velocity_Z) },
  { key: "pitch", scale: 100, read: (r) => num(r.pitch) },
  { key: "yaw", scale: 100, read: (r) => num(r.yaw) },
  { key: "health", scale: 1, read: (r) => num(r.health) },
  { key: "armor", scale: 1, read: (r) => num(r.armor_value) },
  { key: "isAlive", scale: 1, read: (r) => (bool(r.is_alive) ? 1 : 0) },
  { key: "team", scale: 1, read: (r) => num(r.team_num) },
  { key: "weapon", scale: 1, read: (r, w) => w(str(r.active_weapon_name)) },
  { key: "flashDuration", scale: 100, read: (r) => num(r.flash_duration) },
];

const COL = Object.fromEntries(COLUMNS.map((c, i) => [c.key, i])) as Record<ColumnKey, number>;

export interface ReplayPlayer {
  steamId: string;
  name: string;
}

/** One player on one stored frame, with every sampled field. */
export interface ReplaySample {
  steamId: string;
  name: string;
  /** Side on this tick (per-half correct, straight from team_num). */
  team: "CT" | "T";
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  pitch: number;
  yaw: number;
  health: number;
  armor: number;
  isAlive: boolean;
  weapon: string;
  flashDuration: number;
}

export interface ReplayFrame {
  tick: number;
  players: ReplaySample[];
}

/** Shape of a RoundTicks row (minus ids), as written to and read from the DB. */
export interface EncodedRoundTicks {
  version: number;
  startTick: number;
  interval: number;
  frameCount: number;
  players: ReplayPlayer[];
  weapons: string[];
  data: Uint8Array;
}

/** Ticks to request from parseTicks for one round: startTick, +interval, … ≤ endTick. */
export function sampleTickList(startTick: number, endTick: number, interval: number): number[] {
  const ticks: number[] = [];
  for (let t = startTick; t <= endTick; t += interval) ticks.push(t);
  return ticks;
}

/**
 * Build the stored blob for one round from raw parseTicks rows.
 * Rows outside the round's sample grid, and spectators (team_num < 2), are ignored.
 */
export function encodeRoundTicks(
  rows: TickRow[],
  startTick: number,
  endTick: number,
  interval: number
): EncodedRoundTicks {
  const frameCount = Math.floor((endTick - startTick) / interval) + 1;

  const players: ReplayPlayer[] = [];
  const playerIndex = new Map<string, number>();
  const weapons: string[] = [];
  const weaponIdx = new Map<string, number>();
  const weaponIndex = (name: string) => {
    let i = weaponIdx.get(name);
    if (i === undefined) {
      i = weapons.length;
      weapons.push(name);
      weaponIdx.set(name, i);
    }
    return i;
  };

  const placed: Array<{ p: number; f: number; row: TickRow }> = [];
  for (const row of rows) {
    if (num(row.team_num) < 2) continue;
    const offset = num(row.tick) - startTick;
    if (offset < 0 || offset % interval !== 0) continue;
    const f = offset / interval;
    if (f >= frameCount) continue;

    const steamId = str(row.steamid);
    if (!steamId) continue;
    let p = playerIndex.get(steamId);
    if (p === undefined) {
      p = players.length;
      players.push({ steamId, name: str(row.name) });
      playerIndex.set(steamId, p);
    }
    placed.push({ p, f, row });
  }

  const C = COLUMNS.length;
  const values = new Int16Array(players.length * C * frameCount);
  for (const { p, f, row } of placed) {
    for (let c = 0; c < C; c++) {
      const col = COLUMNS[c];
      values[(p * C + c) * frameCount + f] = clampInt16(col.read(row, weaponIndex) * col.scale);
    }
  }

  // Delta-encode each (player, column) run, writing Int16 little-endian.
  const raw = Buffer.alloc(values.length * 2);
  for (let run = 0; run < players.length * C; run++) {
    let prev = 0;
    for (let f = 0; f < frameCount; f++) {
      const i = run * frameCount + f;
      raw.writeInt16LE(wrapInt16(values[i] - prev), i * 2);
      prev = values[i];
    }
  }

  return {
    version: REPLAY_FORMAT_VERSION,
    startTick,
    interval,
    frameCount,
    players,
    weapons,
    data: gzipSync(raw, { level: 9 }),
  };
}

/** Inverse of encodeRoundTicks. Throws on an unknown version or a corrupt blob. */
export function decodeRoundTicks(rec: {
  version: number;
  startTick: number;
  interval: number;
  frameCount: number;
  players: unknown;
  weapons: unknown;
  data: Uint8Array;
}): ReplayFrame[] {
  if (rec.version !== REPLAY_FORMAT_VERSION) {
    throw new Error(`Unsupported RoundTicks version ${rec.version}`);
  }
  const players = rec.players as ReplayPlayer[];
  const weapons = rec.weapons as string[];
  const F = rec.frameCount;
  const C = COLUMNS.length;

  const raw = gunzipSync(rec.data);
  if (raw.length !== players.length * C * F * 2) {
    throw new Error(
      `RoundTicks blob size mismatch: ${raw.length} bytes for ${players.length} players × ${F} frames`
    );
  }

  const values = new Int16Array(players.length * C * F);
  for (let run = 0; run < players.length * C; run++) {
    let prev = 0;
    for (let f = 0; f < F; f++) {
      const i = run * F + f;
      prev = wrapInt16(prev + raw.readInt16LE(i * 2));
      values[i] = prev;
    }
  }

  const at = (p: number, key: ColumnKey, f: number) =>
    values[(p * C + COL[key]) * F + f] / COLUMNS[COL[key]].scale;

  const frames: ReplayFrame[] = [];
  for (let f = 0; f < F; f++) {
    const samples: ReplaySample[] = [];
    for (let p = 0; p < players.length; p++) {
      const team = at(p, "team", f);
      if (team !== 2 && team !== 3) continue;
      samples.push({
        steamId: players[p].steamId,
        name: players[p].name,
        team: team === 2 ? "T" : "CT",
        x: at(p, "x", f),
        y: at(p, "y", f),
        z: at(p, "z", f),
        velX: at(p, "velX", f),
        velY: at(p, "velY", f),
        velZ: at(p, "velZ", f),
        pitch: at(p, "pitch", f),
        yaw: at(p, "yaw", f),
        health: at(p, "health", f),
        armor: at(p, "armor", f),
        isAlive: at(p, "isAlive", f) === 1,
        weapon: weapons[at(p, "weapon", f)] ?? "",
        flashDuration: at(p, "flashDuration", f),
      });
    }
    frames.push({ tick: rec.startTick + f * rec.interval, players: samples });
  }
  return frames;
}

/**
 * Keep every `step`-th frame, always including the last one so playback
 * reaches the end of the round.
 */
export function subsampleFrames<T>(frames: T[], step: number): T[] {
  if (step <= 1 || frames.length === 0) return frames;
  const out: T[] = [];
  for (let i = 0; i < frames.length; i += step) out.push(frames[i]);
  if ((frames.length - 1) % step !== 0) out.push(frames[frames.length - 1]);
  return out;
}

// ─── helpers ─────────────────────────────────────────────

function clampInt16(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-32768, Math.min(32767, Math.round(v)));
}

function wrapInt16(v: number): number {
  return ((((v + 32768) % 65536) + 65536) % 65536) - 32768;
}

function num(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "bigint") return Number(val);
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

function str(val: unknown): string {
  if (typeof val === "string") return val;
  if (val != null) return String(val);
  return "";
}

function bool(val: unknown): boolean {
  if (val === true || val === "true") return true;
  if (typeof val === "number") return val > 0;
  return false;
}
