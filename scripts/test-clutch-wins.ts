/**
 * Regression test for the two parser invariants that are easy to "fix" wrongly.
 * Run: npm run test:clutches
 *
 * 1. computeClutchWins() — half-swap logic.
 *    parsePlayerInfo reports the side a player FINISHED on, but round.winner is
 *    an absolute side. Crediting clutches against the roster verbatim silently
 *    inverts the won/lost flag for every first-half round. The control case at
 *    the bottom proves the swap logic is load-bearing.
 *
 * 2. computeAssistCounts() — assists and flashAssists are disjoint.
 *    A flash-assisted kill must increment flashAssists ONLY. This is a
 *    deliberate divergence from HLTV, which folds flash assists into assists.
 *
 * No demo file required — both functions are pure.
 */
import { computeClutchWins, computeAssistCounts } from "@/lib/parsers/demo-parser";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ─── 1. Clutch wins across the halftime swap ─────────────
//
// Roster sides are END-OF-MATCH: p1/p2 finish CT, p3/p4 finish T.
// So in the FIRST half p1/p2 play T and p3/p4 play CT.

const playerRoster = new Map<string, { team: "CT" | "T" }>([
  ["p1", { team: "CT" }],
  ["p2", { team: "CT" }],
  ["p3", { team: "T" }],
  ["p4", { team: "T" }],
]);

const HALFTIME_TICK = 5000;

const rounds = [
  // First half: p3/p4 play CT here. p1 kills p3 → p4 alone vs p1+p2 → 1v2.
  { number: 1, winner: "CT" as const, endTick: 1000 },
  // Second half: p1/p2 play CT here. p3 kills p1 → p2 alone vs p3+p4 → 1v2.
  { number: 13, winner: "CT" as const, endTick: 9000 },
];

const clutchKills = [
  { tick: 10, roundNumber: 1, attackerSteamId: "p1", victimSteamId: "p3" },
  { tick: 20, roundNumber: 13, attackerSteamId: "p3", victimSteamId: "p1" },
];

const clutchWins = computeClutchWins({
  rounds,
  kills: clutchKills,
  playerRoster,
  halftimeTick: HALFTIME_TICK,
});

console.log("clutchWins:", Object.fromEntries(clutchWins));

check(
  "first-half clutch credited despite swapped sides (p4 = 1)",
  clutchWins.get("p4") === 1
);
check("second-half clutch credited (p2 = 1)", clutchWins.get("p2") === 1);
check(
  "losers get nothing (p1, p3 absent)",
  !clutchWins.has("p1") && !clutchWins.has("p3")
);

// Control: collapse both halves into "second half". The first-half clutch must
// disappear — if it survives, the swap logic has stopped doing anything.
const naive = computeClutchWins({
  rounds,
  kills: clutchKills,
  playerRoster,
  halftimeTick: -Infinity,
});
check(
  "control: roster-verbatim sides drop the first-half clutch",
  (naive.get("p4") ?? 0) === 0
);

// ─── 2. Assists and flashAssists are disjoint ────────────

const assistKills = [
  // Regular assist → assists only.
  { assisterSteamId: "p1", flashAssisted: false },
  // Flash assist → flashAssists only, assists untouched.
  { assisterSteamId: "p1", flashAssisted: true },
  // Unassisted kill → neither.
  { assisterSteamId: undefined, flashAssisted: false },
  // Flash assist by someone outside the roster → ignored entirely.
  { assisterSteamId: "ghost", flashAssisted: true },
];

const assists = computeAssistCounts(assistKills, playerRoster.keys());
const p1 = assists.get("p1");

console.log("assistCounts p1:", p1);

check("flash assist increments flashAssists (p1.flashAssists = 1)", p1?.flashAssists === 1);
check("flash assist does NOT increment assists (p1.assists = 1)", p1?.assists === 1);
check("unknown assister is ignored", !assists.has("ghost"));
check(
  "player with no assists is present and zeroed",
  assists.get("p2")?.assists === 0 && assists.get("p2")?.flashAssists === 0
);

// ─── Report ──────────────────────────────────────────────

console.log();
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);

process.exit(failed > 0 ? 1 : 0);
