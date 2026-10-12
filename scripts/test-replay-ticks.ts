/**
 * Regression test for the stored replay data that replaces live .dem parsing.
 * Run: npm run test:replay
 *
 * 1. encodeRoundTicks() / decodeRoundTicks() round-trip — the 2D replay must
 *    look the same from the DB as it did from the demo: positions to the unit,
 *    angles to 1/100°, yaw across the ±180° seam, per-tick side (team_num), a
 *    player missing for a few frames, spectators dropped, clamping not wrapping.
 * 2. subsampleFrames() — the replay's interval=32 view keeps the last frame.
 * 3. roundForTick() / shotsFromEvents() / damagesFromEvents() — events land in
 *    the right round, warmup and post-match are dropped, world damage is kept.
 * 4. Storage size for a synthetic full match (printed, with a loose budget).
 *
 * No demo file or database required — everything here is pure.
 */
import {
  decodeRoundTicks,
  encodeRoundTicks,
  sampleTickList,
  subsampleFrames,
  REPLAY_SAMPLE_INTERVAL,
} from "@/lib/replay/round-ticks";
import { damagesFromEvents, roundForTick, shotsFromEvents } from "@/lib/parsers/replay-data";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;

// ─── 1. Round-trip ───────────────────────────────────────

const START = 1000;
const END = 1400; // 101 frames at interval 4
const IV = REPLAY_SAMPLE_INTERVAL;

function row(tick: number, steamid: string, extra: Record<string, unknown> = {}) {
  const f = (tick - START) / IV;
  return {
    tick,
    steamid,
    name: `name-${steamid}`,
    X: -1500.4 + f * 3.3,
    Y: 2200.6 - f * 1.7,
    Z: 64.2,
    velocity_X: 250 * Math.cos(f / 10),
    velocity_Y: -120.5,
    velocity_Z: 0,
    pitch: -12.3456,
    // Sweeps through the ±180° seam around frame 50.
    yaw: ((170 + f * 0.4 + 180) % 360) - 180,
    health: Math.max(0, 100 - f),
    armor_value: 100,
    is_alive: f < 100,
    team_num: f < 60 ? 3 : 2, // side flips mid-data: must follow team_num per tick
    active_weapon_name: f < 30 ? "Glock-18" : "AK-47",
    flash_duration: f === 40 ? 2.71 : 0,
    ...extra,
  };
}

const rows: Record<string, unknown>[] = [];
for (const t of sampleTickList(START, END, IV)) {
  rows.push(row(t, "a"));
  // b is missing on frames 20..24 (e.g. reconnect).
  const f = (t - START) / IV;
  if (f < 20 || f > 24) rows.push(row(t, "b", { X: 99999, Y: -99999 }));
  // Spectator / GOTV: must never appear.
  rows.push(row(t, "spec", { team_num: 1 }));
}
// Off-grid tick: must be ignored, not rounded into a frame.
rows.push(row(START + 2, "a", { X: 0 }));

const enc = encodeRoundTicks(rows, START, END, IV);
const frames = decodeRoundTicks(enc);

check("frame count = (end-start)/interval + 1", enc.frameCount === 101 && frames.length === 101);
check("frame ticks follow the grid", frames.every((fr, i) => fr.tick === START + i * IV));
check("spectators are dropped", !enc.players.some((p) => p.steamId === "spec"));

const a = (f: number) => frames[f].players.find((p) => p.steamId === "a")!;
const b = (f: number) => frames[f].players.find((p) => p.steamId === "b");
let posOk = true;
let angleOk = true;
for (let f = 0; f < frames.length; f++) {
  const src = row(START + f * IV, "a");
  const s = a(f);
  if (!near(s.x, src.X, 0.5) || !near(s.y, src.Y, 0.5) || !near(s.velX, src.velocity_X, 0.5)) posOk = false;
  if (!near(s.yaw, src.yaw, 0.005) || !near(s.pitch, src.pitch, 0.005)) angleOk = false;
}
check("positions/velocity within 0.5 unit on every frame", posOk);
check("pitch/yaw within 0.005° on every frame (incl. ±180° seam)", angleOk);
check("off-grid tick ignored (frame 0 x not overwritten by 0)", near(a(0).x, -1500.4, 0.5));
check("per-tick side follows team_num", a(59).team === "CT" && a(60).team === "T");
check("health / alive survive", a(10).health === 90 && a(99).isAlive && !a(100).isAlive);
check("weapon names via table", a(29).weapon === "Glock-18" && a(30).weapon === "AK-47");
check("flash duration to 1/100 s", near(a(40).flashDuration, 2.71, 0.005) && a(41).flashDuration === 0);
check("player absent on missing frames", b(19) !== undefined && b(20) === undefined && b(24) === undefined && b(25) !== undefined);
check("out-of-range values clamp, not wrap", b(0)!.x === 32767 && b(0)!.y === -32768);

// Corrupt blobs must fail loudly, not render garbage.
let threw = false;
try {
  decodeRoundTicks({ ...enc, frameCount: enc.frameCount + 1 });
} catch {
  threw = true;
}
check("size mismatch throws", threw);

// ─── 2. Subsampling for interval=32 ──────────────────────

const sub = subsampleFrames(frames, 32 / IV);
check(
  "subsample keeps first, every 8th and the last frame",
  sub[0].tick === START && sub[1].tick === START + 32 && sub[sub.length - 1].tick === END
);
check("subsample step 1 is identity", subsampleFrames(frames, 1).length === frames.length);

// ─── 3. Event → round assignment ─────────────────────────

const rounds = [
  { number: 1, startTick: 1000, endTick: 5000 },
  { number: 2, startTick: 5500, endTick: 9000 },
];
check("warmup tick dropped", roundForTick(900, rounds) === null);
check("in-round tick", roundForTick(1200, rounds) === 1);
check("post-round-end tick stays with its round", roundForTick(5200, rounds) === 1);
check("after last round end dropped", roundForTick(9100, rounds) === null);

const shots = shotsFromEvents(
  [
    { tick: 6000, user_steamid: "a", weapon: "ak47", user_X: 1, user_Y: 2, user_Z: 3, user_pitch: 4, user_yaw: 5, user_velocity_X: 130, user_velocity_Y: 0, user_velocity_Z: 0 },
    { tick: 1200, user_steamid: "a", weapon: "glock", user_velocity_X: 0 },
    { tick: 500, user_steamid: "a", weapon: "glock" },
    { tick: 1300, weapon: "glock" },
  ],
  rounds
);
check("shots: warmup and anonymous dropped, sorted by tick", shots.length === 2 && shots[0].tick === 1200);
check("shots: shooter velocity kept", shots[1].roundNumber === 2 && shots[1].velX === 130 && shots[1].yaw === 5);

const damages = damagesFromEvents(
  [
    { tick: 1500, user_steamid: "b", attacker_steamid: "a", weapon: "ak47", dmg_health: 27, dmg_armor: 3, health: 73, armor: 97, hitgroup: "chest", attacker_X: 10, user_X: 20 },
    { tick: 1600, user_steamid: "b", weapon: "world", dmg_health: 5, health: 68 },
  ],
  rounds
);
check("damage: attacker fields kept", damages[0].attackerSteamId === "a" && damages[0].attackerX === 10 && damages[0].healthAfter === 73);
check("damage: world damage kept with null attacker", damages[1].attackerSteamId === null && damages[1].attackerX === null);

// ─── 4. Size of a synthetic full match ───────────────────

// 24 rounds × 100 s × 64 tick, 10 players moving/turning smoothly.
let matchBytes = 0;
let rawBytes = 0;
for (let r = 0; r < 24; r++) {
  const start = 0;
  const end = 100 * 64;
  const rr: Record<string, unknown>[] = [];
  for (const t of sampleTickList(start, end, IV)) {
    for (let p = 0; p < 10; p++) {
      const s = t / 64 + p * 7 + r;
      rr.push({
        tick: t,
        steamid: `p${p}`,
        name: `p${p}`,
        X: 1000 * Math.sin(s / 13),
        Y: 1000 * Math.cos(s / 11),
        Z: 50 + 20 * Math.sin(s / 5),
        velocity_X: 250 * Math.cos(s / 13),
        velocity_Y: -250 * Math.sin(s / 11),
        velocity_Z: 0,
        pitch: 5 * Math.sin(s),
        yaw: ((s * 20) % 360) - 180,
        health: 100,
        armor_value: 100,
        is_alive: true,
        team_num: p < 5 ? 2 : 3,
        active_weapon_name: "AK-47",
        flash_duration: 0,
      });
    }
  }
  const e = encodeRoundTicks(rr, start, end, IV);
  matchBytes += e.data.byteLength;
  rawBytes += e.players.length * e.frameCount * 14 * 2;
}
console.log(
  `synthetic match: ${(rawBytes / 1024 / 1024).toFixed(1)} MiB raw → ${(matchBytes / 1024 / 1024).toFixed(2)} MiB stored`
);
check("synthetic full match stores under 4 MiB", matchBytes < 4 * 1024 * 1024);

// ─── Report ──────────────────────────────────────────────

console.log();
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);

process.exit(failed > 0 ? 1 : 0);
