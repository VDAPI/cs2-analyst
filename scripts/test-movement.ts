/**
 * Regression test for the mechanics analysis (movement while shooting,
 * counter-strafe, first-bullet accuracy). Run: npm run test:mechanics
 *
 * Builds a synthetic match — replay frames, shots and damage — and checks:
 * 1. weapon names and per-weapon accuracy thresholds,
 * 2. moving / airborne shots, bursts (first shot vs spray), engagements
 *    (spam and team damage don't count), hit and headshot matching,
 * 3. sides per round (a round-1 teammate is an enemy after the half switch),
 * 4. counter-strafe time interpolated between 4-tick frames,
 * 5. stored moments.
 *
 * No demo file or database required — everything here is pure.
 */
import {
  accurateSpeed,
  analyzeMovement,
  measureCounterStrafe,
  normalizeWeapon,
  type DamageInput,
  type FrameInput,
  type ShotInput,
} from "@/lib/analysis/movement";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const near = (a: number | null | undefined, b: number, eps: number) =>
  a != null && Math.abs(a - b) <= eps;

const A = "76561190000000001";
const B = "76561190000000002";
const C = "76561190000000003";
const TICK_RATE = 64;

// ─── 1. Weapons ──────────────────────────────────────────

check("weapon_ak47 → ak47", normalizeWeapon("weapon_ak47") === "ak47");
check("m4a1_silencer kept", normalizeWeapon("weapon_m4a1_silencer") === "m4a1_silencer");
check("knife is not a gun", normalizeWeapon("weapon_knife") === null);
check("grenade is not a gun", normalizeWeapon("weapon_hegrenade") === null);
check("ak47 threshold 34% of 215", accurateSpeed("ak47") === 73);
check("awp threshold 34% of 200", accurateSpeed("awp") === 68);

// ─── 2. Synthetic match ──────────────────────────────────

/** A's speed: running, a counter-strafe at 1000–1008, still, running again from 1400. */
function speedA(t: number): number {
  if (t < 1000) return 250;
  if (t < 1008) return 250 - ((t - 1000) / 8) * 250;
  if (t < 1400) return 0;
  return 200;
}

function frames(start: number, end: number, teams: Record<string, "CT" | "T">, speedOfA: (t: number) => number) {
  const out: FrameInput[] = [];
  for (let t = start; t <= end; t += 4) {
    out.push({
      tick: t,
      players: Object.entries(teams).map(([steamId, team]) => ({
        steamId,
        team,
        velX: steamId === A ? speedOfA(t) : 0,
        velY: 0,
        isAlive: true,
      })),
    });
  }
  return out;
}

const rounds = [
  { number: 1, startTick: 0, frames: frames(0, 2000, { [A]: "CT", [B]: "T", [C]: "CT" }, speedA) },
  // Half switch: C is now on the other side from A.
  { number: 2, startTick: 3000, frames: frames(3000, 3500, { [A]: "T", [B]: "CT", [C]: "CT" }, () => 0) },
];

const shot = (roundNumber: number, tick: number, steamId: string, weapon: string, velX = 0, velZ = 0): ShotInput => ({
  roundNumber, tick, steamId, weapon, velX, velY: 0, velZ,
});
const dmg = (roundNumber: number, tick: number, attacker: string, victim: string, weapon: string, hitgroup = "chest"): DamageInput => ({
  roundNumber, tick, attackerSteamId: attacker, victimSteamId: victim, weapon, hitgroup,
});

const shots: ShotInput[] = [
  shot(1, 1020, A, "weapon_ak47"), // stopped after a counter-strafe, headshot
  shot(1, 1026, A, "weapon_ak47"), // spray, hits
  shot(1, 1032, A, "weapon_ak47", 150), // spray, moving
  shot(1, 1500, A, "weapon_ak47", 200), // first shot while running (B hit A at 1450)
  shot(1, 1700, A, "weapon_ak47"), // spam: no engagement
  shot(1, 1800, A, "weapon_ak47"), // hits teammate C only: no engagement
  shot(1, 1850, A, "weapon_knife"), // ignored
  shot(1, 1860, A, "weapon_hegrenade"), // ignored
  shot(2, 3100, A, "weapon_ak47"), // hits C, an enemy after the switch
  shot(1, 1100, B, "weapon_deagle", 0, 200), // airborne, hits A
  shot(1, 1300, B, "weapon_awp", 60), // under the AWP threshold
  shot(1, 1340, B, "weapon_awp", 80), // over it
];

const damages: DamageInput[] = [
  dmg(1, 1020, A, B, "ak47", "head"),
  dmg(1, 1027, A, B, "ak47"), // +1 tick after the shot (sub-tick)
  dmg(1, 1100, B, A, "deagle"),
  dmg(1, 1290, A, B, "ak47"), // no matching shot; makes B's AWP shots engagements
  dmg(1, 1450, B, A, "deagle"),
  dmg(1, 1800, A, C, "ak47"), // team damage
  dmg(2, 3100, A, C, "ak47"),
];

const results = analyzeMovement({ tickRate: TICK_RATE, rounds, shots, damages });
const a = results.find((r) => r.steamId === A);
const b = results.find((r) => r.steamId === B);

check("A analysed", !!a);
check("B analysed", !!b);
if (a && b) {
  check("A: 7 gun shots (knife, HE ignored)", a.shots === 7);
  check("A: 2 moving shots", a.movingShots === 2);
  check("A: 3 engagement first shots (spam and team-damage bursts excluded)", a.firstShots === 3);
  check("A: 1 first shot moving", a.firstShotsMoving === 1);
  check("A: 2 first-shot hits (incl. round-2 hit on former teammate)", a.firstShotHits === 2);
  check("A: 2 spray shots, 1 moving, 1 hit", a.sprayShots === 2 && a.sprayShotsMoving === 1 && a.sprayHits === 1);
  check("A: 3 hits, 1 headshot (team damage not a hit)", a.hits === 3 && a.headHits === 1);
  check("A: one counter-strafe measured", a.counterStrafes === 1);
  // speed 250→125→0 on frames 1000/1004/1008: crosses 129 at ~1003.87 and 73 at ~1005.66.
  check("A: counter-strafe ≈ 28 ms", near(a.counterStrafeAvgMs, 28, 2));
  check("A: one shot before the stop finished", a.shotBeforeStop === 1);
  check("A: one moment, the running shot at 1500", a.moments.length === 1 && a.moments[0].tick === 1500);
  check("A: moment details", near(a.moments[0]?.roundTime, 23.4, 0.05) && a.moments[0]?.threshold === 73 && a.moments[0]?.speed === 200 && !a.moments[0]?.hit);
  const ak = a.weapons.find((w) => w.weapon === "ak47");
  check("A: per-weapon ak47 row", ak?.shots === 7 && ak.firstShots === 3 && ak.headHits === 1);

  check("B: 3 shots, all engagement first shots", b.shots === 3 && b.firstShots === 3);
  check("B: airborne deagle + fast AWP are moving, slow AWP isn't", b.firstShotsMoving === 2);
  check("A: moment's enemy is who hit A (B)", a.moments[0]?.enemy === B);
  check("B: airborne moment's enemy is the player B hit (A)", b.moments.find((m) => m.weapon === "deagle")?.enemy === A);
  check("B: airborne moment flagged", b.moments.some((m) => m.weapon === "deagle" && m.airborne && m.hit));
  check("B: AWP and deagle split per weapon", b.weapons.length === 2);
}

// ─── 3. Counter-strafe edge cases ────────────────────────

const still = frames(0, 200, { [A]: "CT" }, () => 0);
check(
  "no running before the shot → no counter-strafe",
  measureCounterStrafe({ tick: 100, steamId: A, velX: 0, velY: 0, gun: "ak47" }, still, TICK_RATE) === null
);
const slowStop = frames(0, 200, { [A]: "CT" }, (t) => (t < 100 ? 250 : 250 - (t - 100) * 5));
const late = measureCounterStrafe({ tick: 130, steamId: A, velX: 100, velY: 0, gun: "ak47" }, slowStop, TICK_RATE);
// Crosses 129 at ~124.2, fires at 130 still above 73: ~90 ms into the stop.
check("shot mid-stop → late, ~90 ms", late?.kind === "late" && near(late.ms, 90, 3));
const running = measureCounterStrafe({ tick: 50, steamId: A, velX: 250, velY: 0, gun: "ak47" }, slowStop, TICK_RATE);
check("shot at full speed → late, 0 ms", running?.kind === "late" && running.ms === 0);

// ─── Report ──────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
