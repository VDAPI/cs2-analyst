/**
 * Regression test for round winners, win reasons and per-round sides.
 * Run: npm run test:sides
 *
 * - demoparser2 returns round_end winner/reason as NUMBERS (2 = T, 3 = CT;
 *   CS2 RoundEndReason). Treating them as strings made every round a CT
 *   elimination win.
 * - Sides are resolved per round: the live team_num samples first, then the
 *   MR12 + MR3-overtime rule counted back from the last round (so a match that
 *   ends before halftime has no swap, and OT halves swap correctly).
 * - Pages infer the same per-round sides from stored winners + scores.
 * - Grenade damage windows, bomb-site letters.
 *
 * No demo file required — everything here is pure.
 */
import {
  assignGrenadeDamage,
  bombSiteLetter,
  pistolRoundNumbers,
  resolveTeamASides,
  scoreRounds,
} from "@/lib/parsers/demo-parser";
import { parseRoundWinner, parseWinReason } from "@/lib/parsers/round-end";
import {
  createSideResolver,
  halfIndex,
  playerSideAtRound,
  ruleSideAtRound,
  sideInRound,
  teamASidesFromScores,
  type Side,
} from "@/lib/utils/sideSplit";
import { detectClutchesBySide } from "@/lib/utils/clutches";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ─── 1. round_end rows as demoparser2 0.41 returns them ──────

const rawRows: Array<{ winner: unknown; reason: unknown; message: string }> = [
  { winner: 2, reason: 9, message: "#SFUI_Notice_Terrorists_Win" },
  { winner: 3, reason: 7, message: "#SFUI_Notice_Bomb_Defused" },
  { winner: 2, reason: 1, message: "#SFUI_Notice_Target_Bombed" },
  { winner: 3, reason: 8, message: "#SFUI_Notice_CTs_Win" },
  { winner: 3, reason: 12, message: "#SFUI_Notice_Target_Saved" },
  { winner: 2, reason: 18, message: "#SFUI_Notice_CTs_Surrender" },
];
const parsed = rawRows.map((r) => ({
  winner: parseRoundWinner(r.winner, r.message),
  reason: parseWinReason(r.reason, r.message),
}));
check(
  "numeric winners: 2 → T, 3 → CT",
  parsed.map((p) => p.winner).join(",") === "T,CT,T,CT,CT,T"
);
check(
  "numeric reasons map to the enum",
  parsed.map((p) => p.reason).join(",") ===
    "ELIMINATION,BOMB_DEFUSED,BOMB_EXPLODED,ELIMINATION,TIME_RAN_OUT,ELIMINATION"
);
check("string winners still work", parseRoundWinner("T") === "T" && parseRoundWinner("CT") === "CT");
check("numeric strings work", parseRoundWinner("2") === "T" && parseRoundWinner("3") === "CT");
check("draw / unknown winner → null", parseRoundWinner(1) === null && parseRoundWinner(null) === null);
check("winner from message when the field is missing", parseRoundWinner(undefined, "#SFUI_Notice_Bomb_Defused") === "CT");
check("string reasons still work", parseWinReason("bomb_defused") === "BOMB_DEFUSED" && parseWinReason("target_saved") === "TIME_RAN_OUT");

// ─── 2. MR12 + MR3 rule ──────────────────────────────────────

// Regulation 13:11 (24 rounds), player finished CT.
check("24 rounds: round 1 swapped", ruleSideAtRound("CT", 1, 24) === "T");
check("24 rounds: round 13 as finished", ruleSideAtRound("CT", 13, 24) === "CT");
// Short match (surrender in round 10): nobody swapped.
check("10-round match: round 1 as finished", ruleSideAtRound("CT", 1, 10) === "CT");
// OT1 ends in round 30. Sides: 1-12 S, 13-27 !S, 28-30 S.
check("OT 30 rounds: round 1 as finished", ruleSideAtRound("CT", 1, 30) === "CT");
check("OT 30 rounds: round 20 swapped", ruleSideAtRound("CT", 20, 30) === "T");
check("OT 30 rounds: round 26 swapped", ruleSideAtRound("CT", 26, 30) === "T");
check("OT 30 rounds: round 29 as finished", ruleSideAtRound("CT", 29, 30) === "CT");
// OT2 ends in round 36. 31-33 same as 28-30, 34-36 swapped.
check("OT 36 rounds: round 1 swapped", ruleSideAtRound("CT", 1, 36) === "T");
check("OT 36 rounds: round 32 swapped", ruleSideAtRound("CT", 32, 36) === "T");
check("OT 36 rounds: round 35 as finished", ruleSideAtRound("CT", 35, 36) === "CT");

// ─── 3. Live samples beat the rule; scores credited per round ─

// teamA (finished CT) = a1, a2; teamB (finished T) = b1, b2.
const roster = new Map<string, { team: Side }>([
  ["a1", { team: "CT" }],
  ["a2", { team: "CT" }],
  ["b1", { team: "T" }],
  ["b2", { team: "T" }],
]);
const live = (aTeamNum: number) =>
  new Map([
    ["a1", aTeamNum],
    ["a2", aTeamNum],
    ["b1", 5 - aTeamNum],
    ["b2", 5 - aTeamNum],
  ]);

// Short match: 10 rounds, teamA was CT all along (no halftime).
{
  const roundNumbers = Array.from({ length: 10 }, (_, i) => i + 1);
  const sides = resolveTeamASides({
    roundNumbers,
    liveTeamsByRound: new Map(roundNumbers.map((n) => [n, live(3)])),
    playerRoster: roster,
  });
  check("short match: teamA CT in round 1 (live)", sides.get(1) === "CT");
  // Same match without samples: rule must agree.
  const ruled = resolveTeamASides({ roundNumbers, liveTeamsByRound: new Map(), playerRoster: roster });
  check("short match: rule fallback agrees", ruled.get(1) === "CT" && ruled.get(10) === "CT");

  // Ts win 8, CTs win 2 → teamB (T all match) 8, teamA 2.
  const winners: Side[] = ["T", "CT", "T", "T", "CT", "T", "T", "T", "T", "T"];
  const rounds = winners.map((w, i) => ({ number: i + 1, winner: w, ctScore: 0, tScore: 0 }));
  const score = scoreRounds(rounds, sides);
  check("short match score 2:8", score.teamA === 2 && score.teamB === 8);
  check("cumulative scores", rounds[1].ctScore === 1 && rounds[1].tScore === 1);

  // Page side inference from stored rounds agrees with the parser.
  const inferred = teamASidesFromScores(rounds);
  check("pages infer teamA CT in every round", [...inferred.values()].every((s) => s === "CT"));
}

// Overtime 16:14 in round 30: teamA T in 1-12, CT in 13-27, T in 28-30.
{
  const roundNumbers = Array.from({ length: 30 }, (_, i) => i + 1);
  const teamASide = (n: number): Side => (n <= 12 || n >= 28 ? "T" : "CT");
  const sides = resolveTeamASides({
    roundNumbers,
    liveTeamsByRound: new Map(roundNumbers.map((n) => [n, live(teamASide(n) === "CT" ? 3 : 2)])),
    playerRoster: roster,
  });
  check("OT: live sides used per round", roundNumbers.every((n) => sides.get(n) === teamASide(n)));

  // teamA wins exactly rounds 1-16, so 16:14.
  const rounds = roundNumbers.map((n) => ({
    number: n,
    winner: n <= 16 ? teamASide(n) : teamASide(n) === "CT" ? ("T" as Side) : ("CT" as Side),
    ctScore: 0,
    tScore: 0,
  }));
  const score = scoreRounds(rounds, sides);
  check("OT score 16:14 credited to teamA", score.teamA === 16 && score.teamB === 14);

  const sideAt = createSideResolver(rounds);
  check("OT page resolver: a1 T in round 5", sideAt("CT", 5) === "T");
  check("OT page resolver: a1 CT in round 26", sideAt("CT", 26) === "CT");
  check("OT page resolver: b1 CT in round 29", sideAt("T", 29) === "CT");

  // Clutch in round 29: teamB (CT there) left 1v2 and loses (T win).
  const clutches = detectClutchesBySide({
    rounds: [
      {
        id: "r29",
        number: 29,
        winner: "T",
        kills: [{ tick: 1, attackerSteamId: "a1", victimSteamId: "b1" }],
      },
    ],
    finalTeamBySteamId: new Map([...roster].map(([id, v]) => [id, v.team])),
    sideAt,
  });
  check(
    "OT clutch: b2 on CT, lost",
    clutches.length === 1 && clutches[0].clutcherSteamId === "b2" && clutches[0].clutcherTeam === "CT" && !clutches[0].won
  );
}

// ─── 4. Grenade damage windows ───────────────────────────────

{
  const dmg = assignGrenadeDamage(
    [
      { index: 0, kind: "MOLOTOV", throwerSteamId: "a1", startTick: 1000, endTick: 1450 },
      { index: 1, kind: "MOLOTOV", throwerSteamId: "a1", startTick: 1200, endTick: 1650 },
      { index: 2, kind: "HE", throwerSteamId: "a1", startTick: 1100, endTick: 1108 },
    ],
    [
      // Burn damage spread over seconds — all belongs to molotov 0 …
      { attackerSteamId: "a1", tick: 1010, kind: "MOLOTOV", damage: 8 },
      { attackerSteamId: "a1", tick: 1150, kind: "MOLOTOV", damage: 8 },
      // … until molotov 1 starts burning; then the latest one gets it
      { attackerSteamId: "a1", tick: 1500, kind: "MOLOTOV", damage: 5 },
      // HE on the detonate tick
      { attackerSteamId: "a1", tick: 1100, kind: "HE", damage: 40 },
      // Another player's fire never counts for a1
      { attackerSteamId: "b1", tick: 1010, kind: "MOLOTOV", damage: 30 },
    ]
  );
  check("molotov collects its whole burn", dmg.get(0) === 16);
  check("overlapping molotov gets the later hits", dmg.get(1) === 5);
  check("HE damage on detonate tick", dmg.get(2) === 40);
}

// ─── 5. Bomb site letters ────────────────────────────────────

check("site entity index + place name → letter", bombSiteLetter(184, "BombsiteA") === "A");
check("letter passes through", bombSiteLetter("B", undefined) === "B");
check("unknown index without place → undefined", bombSiteLetter(185, "CTSpawn") === undefined);

// ─── sideSplit edge cases ────────────────────────────────────

check("halfIndex: regulation halves", halfIndex(1) === 0 && halfIndex(12) === 0 && halfIndex(13) === 1 && halfIndex(24) === 1);
check("halfIndex: MR3 overtime halves", halfIndex(25) === 2 && halfIndex(27) === 2 && halfIndex(28) === 3 && halfIndex(31) === 4);
check("rule: round past lastRound treated as the last half", ruleSideAtRound("T", 20, 12) === "T");
check("rule: entering OT keeps the side (24 → 25)", ruleSideAtRound("CT", 24, 27) === ruleSideAtRound("CT", 25, 27));
check("rule: 28-round OT, round 24 as finished", ruleSideAtRound("CT", 24, 28) === "T" && ruleSideAtRound("CT", 28, 28) === "CT");
check("playerSideAtRound defaults to a 24-round match", playerSideAtRound("CT", 1) === "T" && playerSideAtRound("CT", 13) === "CT");
{
  // sideInRound reads a Map or a plain record, and falls back to the rule.
  const asRecord: Record<number, Side> = { 1: "T", 2: "CT" };
  check("sideInRound: record, teamA (finished CT)", sideInRound("CT", 1, asRecord, 24) === "T");
  check("sideInRound: record, teamB is the other side", sideInRound("T", 2, asRecord, 24) === "T");
  check("sideInRound: missing round falls back to the rule", sideInRound("CT", 5, new Map<number, Side>(), 24) === "T");
}
{
  // A round whose score moves by 2 (data glitch) or has no winner uses the rule;
  // unsorted input is fine.
  const rounds = [
    { number: 2, winner: "CT", ctScore: 1, tScore: 1 },
    { number: 1, winner: "T", ctScore: 1, tScore: 0 },
    { number: 3, winner: "", ctScore: 1, tScore: 2 },
    { number: 4, winner: "CT", ctScore: 3, tScore: 2 },
  ];
  const sides = teamASidesFromScores(rounds);
  check("scores: teamA scored as T in round 1", sides.get(1) === "T");
  check("scores: teamB scored as CT in round 2 → teamA T", sides.get(2) === "T");
  check("scores: no winner → rule fallback", sides.get(3) === ruleSideAtRound("CT", 3, 4));
  check("scores: +2 jump → rule fallback", sides.get(4) === ruleSideAtRound("CT", 4, 4));
  check("scores: empty match → empty map", teamASidesFromScores([]).size === 0);
  const resolve = createSideResolver(rounds);
  check("resolver: teamB player is the other side", resolve("T", 1) === "CT" && resolve("CT", 1) === "T");
}

// ─── Pistol rounds follow the match format ───────────────────

{
  const sidesOf = (half: number, last: number) =>
    new Map(
      Array.from({ length: last }, (_, i): [number, Side] => [i + 1, i + 1 <= half ? "T" : "CT"])
    );
  const set = (s: Set<number>) => [...s].sort((a, b) => a - b).join(",");
  check("MR12: pistols 1 and 13", set(pistolRoundNumbers(sidesOf(12, 24))) === "1,13");
  check("wingman MR8: pistols 1 and 9", set(pistolRoundNumbers(sidesOf(8, 16))) === "1,9");
  check("short match without halftime: only round 1", set(pistolRoundNumbers(sidesOf(10, 10))) === "1");
  check("empty match: no pistols", pistolRoundNumbers(new Map()).size === 0);
  // Overtime halves swap too but start with full money: not pistol rounds.
  const ot = resolveTeamASides({
    roundNumbers: Array.from({ length: 30 }, (_, i) => i + 1),
    liveTeamsByRound: new Map(),
    playerRoster: roster,
  });
  check("OT 30 rounds (rule fallback): pistols 1 and 13 only", set(pistolRoundNumbers(ot)) === "1,13");
  // A gap in the round list never fakes a swap.
  const gap = new Map<number, Side>([[1, "T"], [2, "T"], [4, "CT"], [5, "CT"]]);
  check("gap in rounds is not a swap", set(pistolRoundNumbers(gap)) === "1");
}

// ─── Report ──────────────────────────────────────────────────

console.log();
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);

process.exit(failed > 0 ? 1 : 0);
