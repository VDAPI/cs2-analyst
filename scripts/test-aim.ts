/**
 * Regression test for the aim and duels analysis (S9). Run: npm run test:aim
 *
 * Builds a synthetic match — replay frames with and without spotting data,
 * shots, damage, kills, flashes and reloads — and checks:
 * 1. geometry helpers (yaw wrap, angles to a target), weapon display names,
 * 2. crosshair placement at first sight, reaction time, time to damage,
 * 3. flick / tracking classification and overflick,
 * 4. peek type (wide), dry peek,
 * 5. a duel opened by an enemy the player could not see,
 * 6. FOV fallback without spotting data (no reaction time there),
 * 7. spray control (bullets 4+), shots in the air,
 * 8. running / jumping within earshot of a known enemy,
 * 9. reloads at a bad moment (early near an enemy, hit while reloading),
 * 10. metric verdicts carry a value, a threshold and a status.
 *
 * No demo file or database required — everything here is pure.
 */
import {
  aimMetrics,
  analyzeAim,
  anglesTo,
  wrapDeg,
  type AimFrame,
  type AimFramePlayer,
} from "@/lib/analysis/aim";
import { normalizeWeapon } from "@/lib/analysis/movement";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const near = (a: number | null | undefined, b: number, eps: number) => a != null && Math.abs(a - b) <= eps;

const A = "76561190000000001"; // CT
const B = "76561190000000002"; // T, round 1 duel
const C = "76561190000000003"; // T, round 2 (no spotting data)
const D = "76561190000000004"; // T, round 1 noise / reload target
const TICK_RATE = 64;

// ─── 1. Geometry ─────────────────────────────────────────

check("wrapDeg(190) = -170", wrapDeg(190) === -170);
check("wrapDeg(-180) = 180", wrapDeg(-180) === 180);
check("anglesTo east = yaw 0", near(anglesTo({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }).yaw, 0, 1e-9));
check("anglesTo north = yaw 90", near(anglesTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }).yaw, 90, 1e-9));
check("display names normalise (frames carry 'AK-47', 'M4A1-S', 'Desert Eagle')",
  normalizeWeapon("AK-47") === "ak47" && normalizeWeapon("M4A1-S") === "m4a1_silencer" &&
  normalizeWeapon("Desert Eagle") === "deagle" && normalizeWeapon("SG 553") === "sg556" &&
  normalizeWeapon("knife") === null);
check("target below = positive pitch", anglesTo({ x: 0, y: 0, z: 100 }, { x: 100, y: 0, z: 0 }).pitch > 0);

// ─── 2. Round 1: spotting data ───────────────────────────

const B_POS = { x: 1200, y: 0, z: 0 };
/** A strafes north 300→410 (a wide peek), then stands. */
const aY = (t: number) => Math.min(430, Math.max(0, (t - 300) * (250 / 64)));
const aVelY = (t: number) => (t >= 300 && t < 410 ? 250 : 0);
/** Crosshair offset from B: 30° off, flick through B to −5° (overflick), settle on 0. */
const aOffset = (t: number) => (t < 424 ? 30 : t < 428 ? 15 : t < 432 ? -5 : 0);

function player(steamId: string, team: "CT" | "T", fields: Partial<AimFramePlayer>): AimFramePlayer {
  return {
    steamId, team, x: 0, y: 0, z: 0, velX: 0, velY: 0, velZ: 0, pitch: 0, yaw: 0,
    isAlive: true, weapon: "AK-47", ...fields,
  };
}

const round1: AimFrame[] = [];
for (let t = 0; t <= 2000; t += 4) {
  const aPos = { x: 0, y: aY(t), z: 0 };
  const toB = anglesTo(aPos, B_POS).yaw;
  const aYaw = t <= 444 ? toB + aOffset(t) : anglesTo({ x: 0, y: 430, z: 0 }, B_POS).yaw;
  const dPos = t < 950 ? { x: 5000, y: 5000, z: 0 } : { x: 600, y: 600, z: 0 };
  round1.push({
    tick: t,
    players: [
      player(A, "CT", {
        ...aPos,
        velY: aVelY(t),
        // Running 1000–1100 near D (known enemy); jump at 1200.
        velX: t >= 1000 && t <= 1100 ? 250 : 0,
        velZ: t === 1200 ? 290 : t === 1204 ? 250 : 0,
        yaw: aYaw,
        spottedBy: t >= 400 && t <= 445 ? [B] : [],
      }),
      player(B, "T", {
        ...B_POS,
        yaw: anglesTo(B_POS, aPos).yaw,
        isAlive: t < 445,
        spottedBy: t >= 400 ? [A] : [],
      }),
      player(D, "T", { ...dPos, spottedBy: t >= 950 ? [A] : [] }),
    ],
  });
}

// ─── Round 2: no spotting data (format v1) ───────────────

const round2: AimFrame[] = [];
for (let t = 3000; t <= 4000; t += 4) {
  round2.push({
    tick: t,
    players: [
      // A looks east, C is behind (west) → A can't see C.
      { ...player(A, "CT", { x: 0, y: 0, yaw: 0 }), spottedBy: undefined },
      { ...player(C, "T", { x: -800, y: 0, yaw: 0 }), spottedBy: undefined },
    ],
  });
}

const shot = (roundNumber: number, tick: number, steamId: string, weapon = "weapon_ak47", velZ = 0) => ({
  roundNumber, tick, steamId, weapon, velX: 0, velY: 0, velZ,
});
const dmg = (roundNumber: number, tick: number, attackerSteamId: string, victimSteamId: string, weapon = "ak47") => ({
  roundNumber, tick, attackerSteamId, victimSteamId, weapon,
});

const sprayTicks = [3600, 3608, 3616, 3624, 3632, 3640, 3648, 3656];
const results = analyzeAim({
  tickRate: TICK_RATE,
  rounds: [
    { number: 1, startTick: 0, frames: round1 },
    { number: 2, startTick: 3000, frames: round2 },
  ],
  shots: [
    shot(1, 380, B, "weapon_deagle", 200), // in the air
    shot(1, 440, A),
    shot(1, 1649, A),
    ...sprayTicks.map((t) => shot(2, t, A)),
  ],
  damages: [
    dmg(1, 441, A, B),
    dmg(1, 1650, A, D),
    dmg(2, 3550, C, A),
    dmg(2, 3601, A, C),
    dmg(2, 3609, A, C),
  ],
  kills: [{ roundNumber: 1, tick: 445, attackerSteamId: A, victimSteamId: B }],
  flashes: [],
  reloads: [
    { roundNumber: 1, tick: 1500, steamId: A, weapon: "AK-47", clip: 20 }, // early, D known and near
    { roundNumber: 1, tick: 1600, steamId: D, weapon: "AK-47", clip: 2 }, // hit at 1650
    { roundNumber: 1, tick: 1800, steamId: B, weapon: "AK-47", clip: 3 }, // dead player, nothing near: fine
  ],
});

const a = results.find((r) => r.steamId === A);
const b = results.find((r) => r.steamId === B);
const c = results.find((r) => r.steamId === C);
const d = results.find((r) => r.steamId === D);
check("A, B, C, D analysed", !!a && !!b && !!c && !!d);

if (a && b && c && d) {
  // Duels: A–B (r1), A–D (r1), C–A (r2).
  check("A: 3 duels, 1 opened by an unseen enemy", a.duels === 3 && a.duelsUnseen === 1);
  check("A: visibility mixed (spotting in r1, FOV in r2)", a.visibility === "mixed");
  check("A: crosshair sampled in both r1 duels", a.crosshairSamples === 2);
  check("A: 30° off B at first sight → crosshair moment", a.moments.some((m) => m.type === "crosshair" && m.tick === 400 && near(m.value, 30, 1)));
  check("A: reaction only where the first sight is known (B duel)", a.reactionSamples === 1);
  // Swing starts on the 420 frame: 20 ticks after first sight.
  check("A: reaction ≈ 313 ms", near(a.reactionMedianMs, 313, 2));
  check("A: time to damage ≈ 641 ms (400 → 441)", a.ttdSamples === 1 && near(a.ttdMedianMs, 641, 2));
  check("A: one flick (B), one tracking (D)", a.flicks === 1 && a.trackings === 1 && a.preaims === 0);
  check("A: overflick through B's head", a.overflicks === 1 && a.moments.some((m) => m.type === "overflick" && m.tick === 428));
  check("A: one wide peek, won", a.peeks === 1 && a.peekTypes.wide.count === 1 && a.peekTypes.wide.won === 1 && a.peeksWon === 1);
  check("A: dry peek counted but not lost", a.dryPeeks === 1 && a.dryPeeksLost === 0 && !a.moments.some((m) => m.type === "dry_peek"));
  check("A: spray 8 bullets → 5 from the 4th, 0 hits", a.sprays === 1 && a.sprayBullets === 5 && a.sprayHits === 0);
  check("A: spray moment", a.moments.some((m) => m.type === "spray" && m.roundNumber === 2 && m.value === 8));
  check("A: running near known D = 1 noise episode, not costly", a.noiseEpisodes === 1 && a.noiseCostly === 0);
  check("A: no noise for the peek run (B not within earshot)", !a.moments.some((m) => m.type === "noise" && m.tick < 500));
  check("A: 1 jump, near a known enemy", a.jumps === 1 && a.jumpsNearEnemy === 1);
  check("A: early reload near known D is bad", a.reloads === 1 && a.badReloads === 1 && a.reloadData);
  check("A: reload moment says clip", a.moments.some((m) => m.type === "reload" && m.value === 20 && !m.costly));

  check("B: crosshair on A at first sight (≈0°)", b.crosshairSamples === 1 && near(b.crosshairMedianDeg, 0, 0.5) && b.crosshairBad === 0);
  check("B: never reacted, no reaction sample", b.reactionSamples === 0);
  check("B: one shot in the air", b.airShots === 1 && b.moments.some((m) => m.type === "air_shot"));
  check("B: reload with nothing around is fine", b.reloads === 1 && b.badReloads === 0);

  check("C: FOV visibility, crosshair sampled, no reaction (onset unknown)", c.visibility === "fov" && c.crosshairSamples === 1 && c.reactionSamples === 0);

  check("D: hit while reloading", d.badReloads === 1 && d.moments.some((m) => m.type === "reload" && m.costly));
  check("D: couldn't see A when hit", d.duelsUnseen === 1);

  // ─── Metrics ───
  const metrics = aimMetrics(a);
  check("10 metrics", metrics.length === 10);
  check("every metric has a threshold and a status", metrics.every((m) => m.threshold.length > 0 && !!m.status));
  const cross = metrics.find((m) => m.key === "crosshair")!;
  check("crosshair metric is the median, judged bad/warn", cross.value === a.crosshairMedianDeg && cross.status !== "good" && cross.status !== "none");
  const spray = metrics.find((m) => m.key === "spray")!;
  check("spray 0% is bad", spray.value === 0 && spray.status === "bad");
  const noReload = aimMetrics({ ...a, reloadData: false }).find((m) => m.key === "reload")!;
  check("no reload data → no value, status none", noReload.value === null && noReload.status === "none");
}

// ─── Report ──────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
