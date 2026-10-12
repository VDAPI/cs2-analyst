/**
 * Regression test for the utility analysis, lineup base and callouts (S11).
 * Run: npm run test:utility
 *
 * Checks, on synthetic replay frames (no demo, no DB):
 * 1. "smoke on A main at 1:45 as CT" with nobody there → smoke_early Finding with advice,
 * 2. a smoke that faded right before the enemy came → smoke_early, high, costly,
 * 3. a smoke with an enemy in it, or thrown on team info → no finding,
 * 4. a late void smoke → smoke_void,
 * 5. flashes: teammate blinded and punished → team_flash high; enemy blinded and
 *    nobody peeked → flash_no_peek; followed-up flash → counted, no finding,
 * 6. HE / molotov damage, team damage, no-effect grenades,
 * 7. death with ≥2 grenades → death_with_utility; early death not blamed,
 * 8. throws linked to detonations, lineups clustered, a missed lineup hinted with setpos,
 * 9. callouts: aggregation, lookup, humanised names,
 * 10. utility metrics in the report.
 */
import { analyzeUtility, freezeEndTick, smokeBlocksLine, type UtilityFramePlayer, type UtilityInput, type UtilityRound } from "@/lib/analysis/utility";
import { buildLineups, matchLineup, setposCommand, suggestLineup, type LineupThrow } from "@/lib/analysis/lineups";
import { aggregatePlaces, humanizePlace, placeLookup } from "@/lib/analysis/places";
import { detectFindings, fromUtility } from "@/lib/findings/detect";
import { FINDING_TYPES } from "@/lib/findings/catalog";
import { buildReport, playerMetrics } from "@/lib/findings/report";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

const TR = 64;
const P = "76561190000000001"; // CT, throws everything
const C2 = "76561190000000002"; // CT teammate
const E1 = "76561190000000011"; // T
const E2 = "76561190000000012"; // T
const FREEZE = 15 * TR;
const A_MAIN = { x: 2000, y: 0, z: 0 };
const FAR = { x: 5000, y: 5000, z: 0 };

type Pos = { x: number; y: number; z?: number; flash?: number; spottedBy?: string[]; alive?: boolean };
type Layout = (live: number) => Partial<Record<string, Pos>>;

/** A round of frames every 4 ticks; nobody moves during freeze time. */
function round(number: number, layout: Layout, lengthS = 115): UtilityRound {
  const start = number * 100_000;
  const frames = [];
  for (let tick = start; tick <= start + FREEZE + lengthS * TR; tick += 4) {
    const live = (tick - start - FREEZE) / TR;
    const pos = layout(live);
    const base: Record<string, Pos> = {
      [P]: { x: 0, y: 0 },
      [C2]: { x: 200, y: 0 },
      [E1]: FAR,
      [E2]: { x: FAR.x + 100, y: FAR.y },
    };
    const players: UtilityFramePlayer[] = Object.entries({ ...base, ...pos }).map(([steamId, p]) => ({
      steamId,
      team: steamId === P || steamId === C2 ? "CT" : "T",
      x: p!.x,
      y: p!.y,
      z: p!.z ?? 0,
      velX: live > 0 ? 100 : 0,
      velY: 0,
      isAlive: p!.alive ?? true,
      flashDuration: p!.flash ?? 0,
      spottedBy: p!.spottedBy ?? [],
    }));
    frames.push({ tick, players });
  }
  return { number, startTick: start, endTick: start + FREEZE + lengthS * TR, frames };
}
const at = (n: number, liveS: number) => n * 100_000 + FREEZE + Math.round(liveS * TR);

const rounds: UtilityRound[] = [
  round(1, () => ({})), // smoke A main at 1:45, nobody there
  round(2, (s) => (s >= 10 + 18 + 5 ? { [E1]: { x: 2050, y: 0 } } : {})), // enemy arrives 5 s after it faded
  round(3, (s) => (s >= 9 ? { [E1]: { x: 2100, y: 0 } } : {})), // enemy in the smoke
  round(4, () => ({})), // late void smoke
  round(5, (s) => (s >= 4 && s < 9 ? { [E1]: { x: 2300, y: 0, spottedBy: [P] } } : {})), // seen, then left
  round(6, (s) => (s >= 30 ? { [C2]: { x: 200, y: 0, flash: 2.5 }, [E1]: { x: 600, y: 0, flash: 3 } } : {})),
  round(7, (s) => (s >= 30 ? { [E1]: { x: 600, y: 0, flash: 2 } } : {})),
  round(8, (s) => (s >= 20 && s < 24 ? { [E1]: { x: 2050, y: 0 } } : {})),
  round(9, () => ({})),
];

const det = (n: number, s: number, type: "SMOKE" | "FLASH" | "HE" | "MOLOTOV", pos = A_MAIN) => ({
  tick: at(n, s), roundNumber: n, throwerSteamId: P, type, ...pos,
});
const throwOf = (n: number, s: number, weapon: string, over: Partial<{ x: number; y: number; yaw: number; pitch: number; velZ: number }> = {}) => ({
  tick: at(n, s), roundNumber: n, steamId: P, weapon, x: 100, y: 100, z: 0, pitch: -20, yaw: 10, velX: 0, velY: 0, velZ: 0, ...over,
});

const input: UtilityInput = {
  tickRate: TR,
  rounds,
  detonations: [
    det(1, 10, "SMOKE"),
    det(2, 10, "SMOKE"),
    det(3, 10, "SMOKE"),
    det(4, 60, "SMOKE"),
    det(5, 10, "SMOKE"),
    det(6, 30, "FLASH", { x: 400, y: 0, z: 0 }),
    det(7, 30, "FLASH", { x: 400, y: 0, z: 0 }),
    det(8, 20, "MOLOTOV"),
    det(8, 40, "HE", { x: 3000, y: 3000, z: 0 }),
    det(8, 50, "HE", { x: 200, y: 0, z: 0 }),
  ],
  throws: [
    throwOf(1, 8.5, "weapon_smokegrenade"),
    throwOf(2, 8.5, "weapon_smokegrenade"),
    throwOf(3, 8.5, "weapon_smokegrenade"),
    throwOf(4, 58, "weapon_smokegrenade", { velZ: 250 }),
    throwOf(5, 8.5, "weapon_smokegrenade"),
    throwOf(6, 28.4, "weapon_flashbang"),
    throwOf(8, 18.5, "weapon_molotov"),
  ],
  damages: [
    // Round 6: blinded teammate shot by the enemy while blind.
    { tick: at(6, 31), roundNumber: 6, attackerSteamId: E2, victimSteamId: C2, weapon: "ak47", dmgHealth: 27 },
    // Round 7: the blinded enemy gets hit → flash followed.
    { tick: at(7, 31), roundNumber: 7, attackerSteamId: C2, victimSteamId: E1, weapon: "m4a1", dmgHealth: 33 },
    // Round 8: molotov burns the enemy; second HE hits the teammate.
    { tick: at(8, 21), roundNumber: 8, attackerSteamId: P, victimSteamId: E1, weapon: "inferno", dmgHealth: 18 },
    { tick: at(8, 22), roundNumber: 8, attackerSteamId: P, victimSteamId: E1, weapon: "inferno", dmgHealth: 12 },
    { tick: at(8, 50), roundNumber: 8, attackerSteamId: P, victimSteamId: C2, weapon: "hegrenade", dmgHealth: 40 },
  ],
  kills: [
    { tick: at(9, 40), roundNumber: 9, attackerSteamId: E1, victimSteamId: P, victimInventory: ["Knife", "AK-47", "Smoke Grenade", "Flashbang", "Molotov"] },
    { tick: at(9, 5), roundNumber: 9, attackerSteamId: P, victimSteamId: E2, victimInventory: ["Glock-18", "Flashbang", "High Explosive Grenade"] },
    { tick: at(9, 60), roundNumber: 9, attackerSteamId: E2, victimSteamId: C2, victimInventory: null },
  ],
  plants: [],
};

const result = analyzeUtility(input);
const me = result.find((r) => r.steamId === P)!;
const moments = (type: string) => me.moments.filter((m) => m.type === type);

// ─── 0. Geometry and freeze time ─────────────────────────

check("freeze end = first frame anyone moves", freezeEndTick(rounds[0].frames, 0) === rounds[0].startTick + FREEZE + 4);
check("smoke between two players blocks the line", smokeBlocksLine({ x: 500, y: 0, z: 60 }, { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }));
check("smoke off to the side does not", !smokeBlocksLine({ x: 500, y: 400, z: 60 }, { x: 0, y: 0, z: 0 }, { x: 1000, y: 0, z: 0 }));

// ─── 1–4. Smokes ─────────────────────────────────────────

const early = moments("smoke_early");
const r1 = early.find((m) => m.roundNumber === 1);
check("R1: smoke on A main at ~1:45 as CT → smoke_early", r1 != null && r1.side === "CT" && r1.clock != null && r1.clock >= 104 && r1.clock <= 106);
const r2 = early.find((m) => m.roundNumber === 2);
check("R2: faded ~5 s before the enemy came → smoke_early, costly", r2 != null && r2.costly && r2.lateBy != null && Math.abs(r2.lateBy - 5) <= 0.5 && r2.enemy === E1);
check("R3: enemy in the smoke → no finding", !me.moments.some((m) => m.roundNumber === 3));
check("R5: thrown on team info → no finding", !me.moments.some((m) => m.roundNumber === 5));
check("R4: late void smoke → smoke_void", moments("smoke_void").some((m) => m.roundNumber === 4));
check("smoke counts", me.smokes === 5 && me.smokesVoid === 3 && me.smokesEarly === 2);

// ─── 5. Flashes ──────────────────────────────────────────

const tf = moments("team_flash")[0];
check("R6: teammate blinded and shot → team_flash, costly, punisher as clip target", tf != null && tf.roundNumber === 6 && tf.costly && tf.enemy === E2 && tf.value === 2.5);
check("R6: enemy blinded 3 s, nobody peeked → flash_no_peek", moments("flash_no_peek").some((m) => m.roundNumber === 6 && m.value === 3));
check("R7: blinded enemy hit by the team → followed, no finding", !me.moments.some((m) => m.roundNumber === 7));
check(
  "flash counts",
  me.flashes === 2 && me.flashesBlinding === 2 && me.flashesFollowed === 1 && me.teamFlashes === 1 &&
    me.flashEnemySec === 5 && me.flashTeamSec === 2.5
);

// ─── 6. HE and molotov ───────────────────────────────────

check("molotov damage counted, no finding", me.molotovs === 1 && me.molotovDamage === 30 && moments("molotov_no_effect").length === 0);
check("two HEs, both 0 enemy damage → he_no_effect ×2", me.hes === 2 && me.heDamage === 0 && moments("he_no_effect").length === 2);
check("HE into the teammate → nade_team_damage 40", moments("nade_team_damage").some((m) => m.value === 40) && me.nadeTeamDamage === 40);

// ─── 7. Death with utility ───────────────────────────────

const dwu = moments("death_with_utility");
check("death with smoke+flash+molotov → death_with_utility $900", dwu.length === 1 && dwu[0].value === 900 && dwu[0].enemy === E1);
const e2 = result.find((r) => r.steamId === E2)!;
check("early death counted, not blamed", e2.deaths === 1 && e2.deathsWithUtility === 1 && e2.unusedUtilityValue === 500 && e2.moments.length === 0);
check("unknown inventory not counted", (result.find((r) => r.steamId === C2)?.deaths ?? 0) === 0);

// ─── Findings from the moments ───────────────────────────

const findings = detectFindings({ mechanics: [], aim: [], utility: [{ steamId: P, moments: me.moments, throws: me.throws }], utilityContext: { placeOf: (p) => (Math.hypot(p.x - A_MAIN.x, p.y - A_MAIN.y) < 400 ? "A Main" : null) } });
const f1 = findings.find((f) => f.type === "smoke_early" && f.roundNumber === 1);
check(
  "Finding: „smoke na A Main o 1:45 jako CT” with advice",
  f1 != null && f1.category === "utility" && f1.detail.includes("A Main") && f1.detail.includes("1:45") &&
    f1.detail.includes("CT") && f1.advice.length > 30 && f1.severity === "medium"
);
check("Finding: faded-before-enemy smoke is high", findings.some((f) => f.type === "smoke_early" && f.roundNumber === 2 && f.severity === "high" && f.targetSteamId === E1));
check("Finding: team flash punished is high", findings.some((f) => f.type === "team_flash" && f.severity === "high"));
check("every utility finding has a catalog type, round, tick, advice", findings.every((f) => f.type in FINDING_TYPES && f.roundNumber > 0 && f.tick > 0 && f.advice.length > 20));

// ─── 8. Throws and lineups ───────────────────────────────

check("throws linked to detonations", me.throws.length === 7 && me.throws.every((t) => t.detTick >= t.throwTick));
check("jump throw recognised", me.throws.find((t) => t.roundNumber === 4)?.technique === "jump");
const smokeThrow = me.throws.find((t) => t.roundNumber === 1)!;
const base: LineupThrow[] = ["m1", "m2", "m3"].flatMap((matchId, i) => [
  { ...smokeThrow, matchId, steamId: `p${i}`, x: smokeThrow.x + i * 3, yaw: smokeThrow.yaw + i * 0.2 },
]);
const lineups = buildLineups(base, (p) => (Math.hypot(p.x - A_MAIN.x, p.y - A_MAIN.y) < 400 ? "A Main" : "CT Spawn"));
check("3 throws from 3 matches → one lineup", lineups.length === 1 && lineups[0].samples === 3 && lineups[0].matches === 3);
check("lineup named from callouts", lineups[0].landPlace === "A Main" && lineups[0].throwPlace === "CT Spawn");
check("too few matches → no lineup", buildLineups(base.map((t) => ({ ...t, matchId: "m1" }))).length === 0);
check("the same throw is recognised as the lineup", matchLineup(smokeThrow, lineups) != null && suggestLineup(smokeThrow, lineups) == null);
const missed = { ...smokeThrow, x: 900, y: -700, yaw: 60, land: { x: A_MAIN.x + 180, y: 60, z: 0 } };
const hint = suggestLineup(missed, lineups);
check("eyeballed smoke 190 u off → lineup hint", hint != null && hint.offBy >= 180 && hint.offBy <= 200);
check("setpos command", /^setpos -?\d+\.\d{2} -?\d+\.\d{2} -?\d+\.\d{2};setang -?\d+\.\d{2} -?\d+\.\d{2} 0$/.test(setposCommand(lineups[0])));
const hintFindings = fromUtility([{ steamId: P, moments: [], throws: [missed] }], { lineups });
check("lineup_miss Finding carries setpos in the advice", hintFindings.length === 1 && hintFindings[0].type === "lineup_miss" && hintFindings[0].advice.includes("setpos"));

// ─── 9. Callouts ─────────────────────────────────────────

const cells = aggregatePlaces([
  { x: 2000, y: 10, z: 0, place: "LongA" },
  { x: 2010, y: 20, z: 0, place: "LongA" },
  { x: 2020, y: 30, z: 0, place: "BombsiteA" },
  { x: 0, y: 0, z: 0, place: "" },
]);
check("aggregation per cell and name, empty names dropped", cells.length === 2 && cells.find((c) => c.place === "LongA")?.count === 2);
const lookup = placeLookup(cells);
check("lookup picks the most common name", lookup({ x: 2005, y: 5, z: 10 }) === "Long A");
check("lookup falls back to neighbouring cells", lookup({ x: 2130, y: 5, z: 0 }) === "Long A");
check("lookup far away → null", lookup({ x: -3000, y: -3000, z: 0 }) === null);
check(
  "callouts humanised",
  humanizePlace("TopofMid") === "Top of Mid" && humanizePlace("CTSpawn") === "CT Spawn" &&
    humanizePlace("BombsiteA") === "Bombsite A" && humanizePlace("TSpawn") === "T Spawn"
);

// ─── 10. Report metrics ──────────────────────────────────

const metrics = playerMetrics(null, null, null, { ...me, smokes: 10, smokesVoid: 5, flashes: 6, flashEnemySec: 3, flashTeamSec: 6 });
const m = (k: string) => metrics.find((x) => x.key === k);
check("smoke metric: 50% wasted → bad", m("smoke_wasted")?.value === 50 && m("smoke_wasted")?.status === "bad");
check("flash blind metric: 0.5 s per flash → bad", m("flash_blind")?.value === 0.5 && m("flash_blind")?.status === "bad");
check("team flash metric: 1 s per flash → bad", m("team_flash")?.status === "bad");
check("HE metric with 2 HEs → not judged (too few)", m("he_damage")?.status === "none");
const report = buildReport(findings, metrics);
check("report has a utility category with issues", (report.byCategory.find((c) => c.category.key === "utility")?.issues.length ?? 0) > 0);
check("unused-utility metric only with inventory data", playerMetrics(null, null, null, { ...me, inventoryData: false }).every((x) => x.key !== "unused_utility"));

// ─────────────────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed > 0) process.exit(1);
