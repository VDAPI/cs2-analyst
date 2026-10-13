/**
 * Extract the data that must outlive the .dem file: sampled per-round player
 * state (for the 2D replay) and every weapon_fire / player_hurt (for the
 * mechanics analysis). Persisted by persistReplayData() in persist-replay.ts.
 *
 * Runs in the parse worker (and the backfill script), never in API routes.
 */
import {
  REPLAY_EXTRA_PROPS,
  REPLAY_SAMPLE_INTERVAL,
  REPLAY_TICK_PROPS,
  encodeRoundTicks,
  sampleTickList,
  type EncodedRoundTicks,
} from "@/lib/replay/round-ticks";
import { loadDemoParser, parseTickRows } from "./load-parser";

// demoparser2 (native bindings), or the E2E fixture parser.
const getParser = loadDemoParser;

/**
 * parseTicks returns one JS object per player per tick, so a whole match at
 * 4-tick sampling is ~400k objects. Parse a few rounds per pass to bound memory
 * (every pass also costs one read of the demo, ~0.2 s, hence not fewer).
 */
const ROUNDS_PER_PASS = 8;

/**
 * demoparser2 derives velocity from the previous *requested* tick, so the
 * first two samples of a round hold either nothing (first round of a pass) or
 * the jump from the last round's end to the spawn (~100k u/s), which read as
 * jumps and early movement. Players are frozen there anyway: store 0.
 */
const VELOCITY_WARMUP_SAMPLES = 2;

function clearVelocity(row: Record<string, unknown>) {
  row.velocity_X = null;
  row.velocity_Y = null;
  row.velocity_Z = null;
}

export interface ReplayRoundWindow {
  number: number;
  startTick: number;
  endTick: number;
}

export interface ParsedShot {
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

export interface ParsedDamage {
  tick: number;
  roundNumber: number;
  attackerSteamId: string | null;
  victimSteamId: string;
  weapon: string;
  dmgHealth: number;
  dmgArmor: number;
  healthAfter: number;
  armorAfter: number;
  hitgroup: string;
  attackerX: number | null;
  attackerY: number | null;
  attackerZ: number | null;
  attackerPitch: number | null;
  attackerYaw: number | null;
  victimX: number;
  victimY: number;
  victimZ: number;
}

export interface ParsedReload {
  tick: number;
  roundNumber: number;
  steamId: string;
  weapon: string;
  /** Rounds left in the clip when the reload started; null when unknown. */
  clip: number | null;
  x: number;
  y: number;
  z: number;
}

export interface ReplayData {
  roundTicks: Map<number, EncodedRoundTicks>;
  shots: ParsedShot[];
  damages: ParsedDamage[];
  reloads: ParsedReload[];
}

export async function parseReplayData(
  rawPath: string,
  rounds: ReplayRoundWindow[]
): Promise<ReplayData> {
  const parser = await getParser();
  // demoparser2 (Rust) needs forward-slash paths to avoid "IllegalPathOp" on Windows.
  const filePath = rawPath.replace(/\\/g, "/");

  const roundTicks = new Map<number, EncodedRoundTicks>();
  // Visibility and clip (format v2) are best-effort: if the parser can't read
  // them, fall back to the base props for the rest of the match.
  let withExtras = true;
  for (let i = 0; i < rounds.length; i += ROUNDS_PER_PASS) {
    const batch = rounds.slice(i, i + ROUNDS_PER_PASS);
    const wanted = batch.flatMap((r) =>
      sampleTickList(r.startTick, r.endTick, REPLAY_SAMPLE_INTERVAL)
    );
    let rows: Record<string, unknown>[] | null = null;
    if (withExtras) {
      try {
        rows = parseTickRows(parser, filePath, [...REPLAY_TICK_PROPS, ...REPLAY_EXTRA_PROPS], wanted);
      } catch (err) {
        console.warn("[replay-data] visibility/ammo props unavailable, storing format v1:", err);
        withExtras = false;
      }
    }
    if (!rows) {
      rows = parseTickRows(parser, filePath, REPLAY_TICK_PROPS, wanted);
    }
    const byRound = new Map<number, Record<string, unknown>[]>(batch.map((r) => [r.number, []]));
    for (const row of rows) {
      const t = Number(row.tick);
      for (const r of batch) {
        if (t < r.startTick || t > r.endTick) continue;
        if (t < r.startTick + VELOCITY_WARMUP_SAMPLES * REPLAY_SAMPLE_INTERVAL) clearVelocity(row);
        byRound.get(r.number)?.push(row);
      }
    }
    rows = null;
    for (const r of batch) {
      const inRound = byRound.get(r.number) ?? [];
      byRound.delete(r.number);
      roundTicks.set(
        r.number,
        encodeRoundTicks(inRound, r.startTick, r.endTick, REPLAY_SAMPLE_INTERVAL, withExtras)
      );
    }
  }

  const fireEvents = (parser.parseEvent(filePath, "weapon_fire", [
    "X", "Y", "Z", "pitch", "yaw", "velocity_X", "velocity_Y", "velocity_Z",
  ]) ?? []) as Record<string, unknown>[];
  const hurtEvents = (parser.parseEvent(filePath, "player_hurt", [
    "X", "Y", "Z", "pitch", "yaw",
  ]) ?? []) as Record<string, unknown>[];

  // Reloads feed the "reload at a bad moment" check; never fail the replay for them.
  let reloadEvents: Record<string, unknown>[] = [];
  try {
    reloadEvents = (parser.parseEvent(filePath, "weapon_reload", [
      "X", "Y", "Z", "active_weapon_name", "active_weapon_ammo",
    ]) ?? []) as Record<string, unknown>[];
  } catch (err) {
    console.warn("[replay-data] weapon_reload unavailable:", err);
  }

  return {
    roundTicks,
    shots: shotsFromEvents(fireEvents, rounds),
    damages: damagesFromEvents(hurtEvents, rounds),
    reloads: reloadsFromEvents(reloadEvents, rounds),
  };
}

/**
 * Round an event belongs to: the last round started at or before it (so
 * post-round-end events stay with their round, matching kills). Events before
 * the first round (warmup, knife) or after the last round ends are dropped.
 */
export function roundForTick(tick: number, rounds: ReplayRoundWindow[]): number | null {
  let found: ReplayRoundWindow | null = null;
  for (const r of rounds) {
    if (r.startTick <= tick && (!found || r.startTick > found.startTick)) found = r;
  }
  if (!found) return null;
  const last = rounds.reduce((a, b) => (b.startTick > a.startTick ? b : a));
  if (found === last && tick > last.endTick) return null;
  return found.number;
}

export function shotsFromEvents(
  events: Record<string, unknown>[],
  rounds: ReplayRoundWindow[]
): ParsedShot[] {
  const shots: ParsedShot[] = [];
  for (const e of events) {
    const steamId = str(e.user_steamid);
    if (!steamId) continue;
    const tick = num(e.tick);
    const roundNumber = roundForTick(tick, rounds);
    if (roundNumber === null) continue;
    shots.push({
      tick,
      roundNumber,
      steamId,
      weapon: str(e.weapon),
      x: num(e.user_X),
      y: num(e.user_Y),
      z: num(e.user_Z),
      pitch: num(e.user_pitch),
      yaw: num(e.user_yaw),
      velX: num(e.user_velocity_X),
      velY: num(e.user_velocity_Y),
      velZ: num(e.user_velocity_Z),
    });
  }
  return shots.sort((a, b) => a.tick - b.tick);
}

export function damagesFromEvents(
  events: Record<string, unknown>[],
  rounds: ReplayRoundWindow[]
): ParsedDamage[] {
  const damages: ParsedDamage[] = [];
  for (const e of events) {
    const victimSteamId = str(e.user_steamid);
    if (!victimSteamId) continue;
    const tick = num(e.tick);
    const roundNumber = roundForTick(tick, rounds);
    if (roundNumber === null) continue;
    // World / fall damage has no attacker; keep the event, null the attacker.
    const attackerSteamId = str(e.attacker_steamid) || null;
    damages.push({
      tick,
      roundNumber,
      attackerSteamId,
      victimSteamId,
      weapon: str(e.weapon),
      dmgHealth: num(e.dmg_health),
      dmgArmor: num(e.dmg_armor),
      healthAfter: num(e.health),
      armorAfter: num(e.armor),
      hitgroup: str(e.hitgroup),
      attackerX: attackerSteamId ? num(e.attacker_X) : null,
      attackerY: attackerSteamId ? num(e.attacker_Y) : null,
      attackerZ: attackerSteamId ? num(e.attacker_Z) : null,
      attackerPitch: attackerSteamId ? num(e.attacker_pitch) : null,
      attackerYaw: attackerSteamId ? num(e.attacker_yaw) : null,
      victimX: num(e.user_X),
      victimY: num(e.user_Y),
      victimZ: num(e.user_Z),
    });
  }
  return damages.sort((a, b) => a.tick - b.tick);
}

export function reloadsFromEvents(
  events: Record<string, unknown>[],
  rounds: ReplayRoundWindow[]
): ParsedReload[] {
  const reloads: ParsedReload[] = [];
  for (const e of events) {
    const steamId = str(e.user_steamid);
    if (!steamId) continue;
    const tick = num(e.tick);
    const roundNumber = roundForTick(tick, rounds);
    if (roundNumber === null) continue;
    reloads.push({
      tick,
      roundNumber,
      steamId,
      weapon: str(e.user_active_weapon_name),
      clip: e.user_active_weapon_ammo == null ? null : num(e.user_active_weapon_ammo),
      x: num(e.user_X),
      y: num(e.user_Y),
      z: num(e.user_Z),
    });
  }
  return reloads.sort((a, b) => a.tick - b.tick);
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

/** Seconds between callout samples (one row per player per sample). */
const PLACE_SAMPLE_INTERVAL_S = 1;

/**
 * Every player's position and callout name (`last_place_name`) once per
 * second of every round, for the map's callout grid (S11, places.ts).
 * Best-effort: returns [] when the parser can't read the prop.
 */
export async function parsePlaceSamples(
  rawPath: string,
  rounds: ReplayRoundWindow[],
  tickRate: number
): Promise<Array<{ x: number; y: number; z: number; place: string }>> {
  const parser = await getParser();
  const filePath = rawPath.replace(/\\/g, "/");
  const step = Math.max(1, Math.round(tickRate * PLACE_SAMPLE_INTERVAL_S));
  const wanted = rounds.flatMap((r) => sampleTickList(r.startTick, r.endTick, step));
  if (wanted.length === 0) return [];
  try {
    const rows = parseTickRows(parser, filePath, ["X", "Y", "Z", "last_place_name"], wanted);
    return rows
      .map((r) => ({ x: num(r.X), y: num(r.Y), z: num(r.Z), place: str(r.last_place_name) }))
      .filter((s) => s.place !== "");
  } catch (err) {
    console.warn("[replay-data] last_place_name unavailable, no callouts from this demo:", err);
    return [];
  }
}
