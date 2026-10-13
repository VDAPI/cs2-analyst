/**
 * Regression test for the tactics analysis (S12). Run: npm run test:tactics
 *
 * Builds a synthetic match — sides swap at halftime, some rounds with replay
 * frames (and spotting data), some with kills only — and checks that every
 * S12 type is detected where it should be and nowhere else:
 * 1. sides per half (frames, and the regulation fallback without frames),
 * 2. trades: traded deaths, trades made, a missed trade, an untraded death,
 * 3. entry and lurk deaths as T,
 * 4. early rotation judged by the team's own spotting,
 * 5. post-plant death, solo retake, clutch decisions (save, no plant),
 * 6. economy: bad force (with the loss-bonus estimate), no drop, death with money,
 * 7. predictable CT position,
 * 8. findings: one type each, with advice, values and report metrics,
 * 9. isolated aggression (S31): a lone CT on a bombsite who left the spot to
 *    fight, against one who held it and one with a teammate close,
 * 10. role-aware findings (S31): severity steps and advice per role.
 *
 * No demo file or database required — everything here is pure.
 */
import {
  analyzeTactics,
  freezeEndTick,
  halfOf,
  isLastOfHalf,
  lossBonus,
  type PlayerTactics,
  type TacticsBomb,
  type TacticsDamage,
  type TacticsEcon,
  type TacticsFrame,
  type TacticsKill,
  type TacticsMomentType,
  type TacticsRound,
} from "@/lib/analysis/tactics";
import { FINDING_TYPES } from "@/lib/findings/catalog";
import { applyRole, detectFindings, ROLE_RULES } from "@/lib/findings/detect";
import { buildReport, playerMetrics } from "@/lib/findings/report";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

const TICK_RATE = 64;
const FREEZE = 15 * TICK_RATE; // 960

// Team A finishes on CT (so plays T in rounds 1–12), team B the opposite.
const A1 = "76561190000000001";
const A2 = "76561190000000002";
const A3 = "76561190000000003";
const B1 = "76561190000000011";
const B2 = "76561190000000012";
const B3 = "76561190000000013";
const A = [A1, A2, A3];
const B = [B1, B2, B3];
const players = [
  ...A.map((id, i) => ({ steamId: id, name: `A${i + 1}`, team: "CT" as const })),
  ...B.map((id, i) => ({ steamId: id, name: `B${i + 1}`, team: "T" as const })),
];

interface Pos {
  x: number;
  y: number;
  z?: number;
  spottedBy?: string[];
}
type Track = (tick: number) => Pos;

const kills: TacticsKill[] = [];
const damages: TacticsDamage[] = [];
const bombs: TacticsBomb[] = [];
const economy: TacticsEcon[] = [];
const rounds: TacticsRound[] = [];

function kill(roundNumber: number, tick: number, attacker: string, victim: string, aPos: Pos, vPos: Pos) {
  kills.push({
    tick, roundNumber, attackerSteamId: attacker, victimSteamId: victim,
    attackerPosX: aPos.x, attackerPosY: aPos.y, attackerPosZ: 0,
    victimPosX: vPos.x, victimPosY: vPos.y, victimPosZ: 0,
  });
}

/**
 * Frames every 4 ticks. Everyone stands still in freeze time; after it the
 * first B player "moves" so freeze end is detected. Alive comes from kills.
 */
function frames(roundNumber: number, endTick: number, aSide: "CT" | "T", tracks: Record<string, Track>, spotting = true): TacticsFrame[] {
  const out: TacticsFrame[] = [];
  const deathOf = (id: string) =>
    kills.find((k) => k.roundNumber === roundNumber && k.victimSteamId === id)?.tick ?? Infinity;
  for (let t = 0; t <= endTick; t += 4) {
    out.push({
      tick: t,
      players: [...A, ...B].map((id) => {
        const p = tracks[id]?.(t) ?? { x: 9000, y: 9000 };
        return {
          steamId: id,
          team: A.includes(id) ? aSide : aSide === "CT" ? "T" : "CT",
          x: p.x, y: p.y, z: p.z ?? 0,
          velX: t >= FREEZE && id === B1 ? 100 : 0,
          velY: 0,
          isAlive: t < deathOf(id),
          spottedBy: spotting ? p.spottedBy ?? [] : undefined,
        };
      }),
    });
  }
  return out;
}

function round(
  number: number,
  winner: "CT" | "T",
  winReason: string,
  endTick: number,
  f: TacticsFrame[] = [],
  score: [number, number] = [0, 0]
) {
  rounds.push({ number, startTick: 0, endTick, winner, winReason, ctScore: score[0], tScore: score[1], frames: f });
}

const still = (x: number, y: number): Track => () => ({ x, y });

// ─── Round 3 (A = T): entry death, missed trade, clutch without a plant ──
kill(3, 2000, B1, A1, { x: 2000, y: 0 }, { x: 0, y: 0 });
kill(3, 2500, B2, A3, { x: 1500, y: 2000 }, { x: 1000, y: 2000 });
round(3, "CT", "TIME_RAN_OUT", 6400, frames(3, 6400, "T", {
  [A1]: still(0, 0),
  [A2]: still(1200, 2300), // 1200+ from A1, ~320 from A3
  [A3]: still(1000, 2000),
  [B1]: still(2000, 0),
  [B2]: still(1500, 2000),
  [B3]: still(5000, 5000),
}));

// ─── Round 4 (A = T, no frames): opening kill for A1 ───
kill(4, 1500, A1, B1, { x: 0, y: 0 }, { x: 500, y: 0 });
round(4, "CT", "ELIMINATION", 4000, [], [0, 4]);

// ─── Rounds 5–6 (A = T): force, loss, no full buy next round ───
for (const id of A) economy.push({ roundNumber: 5, steamId: id, equipValue: 2500, money: 1000 });
for (const id of A) economy.push({ roundNumber: 6, steamId: id, equipValue: 1000, money: 300 });
round(5, "CT", "ELIMINATION", 4000, [], [0, 5]);
round(6, "CT", "ELIMINATION", 4000, [], [0, 6]);

// ─── Round 7 (A = T): no drop (A1 rich, A3 broke), B1 dies with money ───
economy.push(
  { roundNumber: 7, steamId: A1, equipValue: 4500, money: 4000 },
  { roundNumber: 7, steamId: A2, equipValue: 4500, money: 500 },
  { roundNumber: 7, steamId: A3, equipValue: 800, money: 600 },
  { roundNumber: 7, steamId: B1, equipValue: 3000, money: 3500 },
  { roundNumber: 7, steamId: B2, equipValue: 5000, money: 200 },
  { roundNumber: 7, steamId: B3, equipValue: 5000, money: 200 },
);
kill(7, 2000, A2, B1, { x: 0, y: 0 }, { x: 500, y: 0 });
round(7, "CT", "ELIMINATION", 4000, [], [1, 6]);

// ─── Round 8 (A = T): A1 trades A2, A3 dies lurking ───
kill(8, 1500, B1, A2, { x: 500, y: 0 }, { x: 100, y: 0 });
kill(8, 1600, A1, B1, { x: 0, y: 0 }, { x: 500, y: 0 });
kill(8, 3000, B2, A3, { x: 4300, y: 0 }, { x: 4000, y: 0 });
round(8, "T", "ELIMINATION", 5000, frames(8, 5000, "T", {
  [A1]: still(0, 0),
  [A2]: still(100, 0),
  [A3]: still(4000, 0),
  [B1]: still(500, 0),
  [B2]: still(4300, 0),
}), [2, 6]);

// ─── Round 12 (A = T, last of half): B2 dies with money that will be lost ───
economy.push(
  { roundNumber: 12, steamId: B1, equipValue: 5000, money: 300 },
  { roundNumber: 12, steamId: B2, equipValue: 5000, money: 2000 },
  { roundNumber: 12, steamId: B3, equipValue: 5000, money: 300 },
);
kill(12, 2000, A1, B2, { x: 0, y: 0 }, { x: 500, y: 0 });
round(12, "T", "ELIMINATION", 4000, [], [4, 8]);

// ─── Round 15 (A = CT): early rotation, post-plant death, solo retakes, save ───
const SITE = { x: 3000, y: 0 };
const PLANT = 4000;
bombs.push({ tick: PLANT, roundNumber: 15, type: "PLANTED", playerSteamId: B1, posX: SITE.x, posY: SITE.y, posZ: 0, site: "B" });
bombs.push({ tick: PLANT + 40 * TICK_RATE, roundNumber: 15, type: "EXPLODED", playerSteamId: B1, posX: SITE.x, posY: SITE.y, posZ: 0, site: "B" });
kill(15, 4500, A2, B2, { x: 1500, y: -1500 }, { x: 3200, y: -2000 });
kill(15, 5000, B1, A3, { x: 3000, y: 200 }, { x: 3200, y: 500 });
kill(15, 5500, B3, A2, { x: 1300, y: -1500 }, { x: 1500, y: -1500 });
kill(15, PLANT + 35 * TICK_RATE, B1, A1, { x: 3000, y: 200 }, { x: 6000, y: 0 });
round(15, "T", "BOMB_EXPLODED", PLANT + 41 * TICK_RATE, frames(15, PLANT + 41 * TICK_RATE, "CT", {
  // A1 holds B (2800,0) and walks away at 3000, reaching (6000,0) before the plant.
  [A1]: (t) => ({ x: t < 3000 ? 2800 : Math.min(6000, 2800 + (t - 3000) * 4), y: 0 }),
  [A2]: still(1500, -1500),
  [A3]: still(3200, 500),
  // The CTs saw only B1, once, before A1 left.
  [B1]: (t) => ({ x: 3000, y: 200, spottedBy: t >= 2500 && t < 2600 ? [A2] : [] }),
  [B2]: still(3200, -2000),
  [B3]: still(1300, -3500),
}), [8, 6]);

// ─── Round 16 (no frames, A = CT by the fallback): a traded death ───
kill(16, 1000, A1, B1, { x: 0, y: 0 }, { x: 500, y: 0 });
kill(16, 1100, B2, A1, { x: 600, y: 0 }, { x: 0, y: 0 });
round(16, "CT", "ELIMINATION", 4000, [], [9, 6]);

// ─── Rounds 17–21 (A = CT): same spot every round, punished in 20 and 21 ───
for (const n of [17, 18, 19, 20, 21]) {
  if (n === 17) kill(17, 2500, B1, A3, { x: 4000, y: -3000 }, { x: 5000, y: -3000 });
  if (n >= 20) kill(n, 2600, B1, A1, { x: 4000, y: 4000 }, { x: 1000, y: 1000 });
  round(n, "CT", "ELIMINATION", 3000, frames(n, 3000, "CT", {
    [A1]: still(1000, 1000),
    [A2]: (t) => ({ x: 1000 + (n % 2) * 2000, y: 1300 + t * 0 }),
    [A3]: still(5000, -3000),
    [B1]: still(4000, 4000),
  }), [9 + n - 16, 6]);
}

const result = analyzeTactics({ tickRate: TICK_RATE, rounds, kills, damages, bombs, economy, players });
const of = (id: string) => result.find((p) => p.steamId === id) as PlayerTactics;
const moments = (id: string, type: TacticsMomentType) => of(id).moments.filter((m) => m.type === type);
const allOf = (type: TacticsMomentType) => result.flatMap((p) => p.moments.filter((m) => m.type === type).map((m) => ({ ...m, steamId: p.steamId })));

// ─── 1. Helpers and sides ────────────────────────────────

check("halves: 12 / 24 / OT by 3", halfOf(12) === 0 && halfOf(13) === 1 && halfOf(24) === 1 && halfOf(25) === 2 && halfOf(28) === 3);
check("last round of half: 12, 24, 27", isLastOfHalf(12) && isLastOfHalf(24) && isLastOfHalf(27) && !isLastOfHalf(13));
check("loss bonus 1400 → 3400", lossBonus(1) === 1400 && lossBonus(2) === 1900 && lossBonus(9) === 3400);
check("freeze end from the first movement", freezeEndTick(rounds.find((r) => r.number === 3)!, TICK_RATE) === FREEZE);
check("freeze end fallback without frames", freezeEndTick({ startTick: 100, frames: [] }, TICK_RATE) === 100 + FREEZE);
check("every player gets a row", result.length === 6);
check("rounds counted for everyone", result.every((p) => p.rounds === rounds.length));
check("fallback sides: round 4 opening counted for A1 (T in the 1st half)", of(A1).openingWins >= 1);

// ─── 2. Trades ───────────────────────────────────────────

check("round 16 (no frames): B1's death traded within 3 s", of(B1).tradedDeaths >= 1);
check("round 8: A1 nearest to A2's death and traded it", of(A1).tradeChances >= 1 && of(A1).tradesMade >= 1);
check("round 8: no missed trade for A1", !moments(A1, "missed_trade").some((m) => m.roundNumber === 8));
const missed = moments(A2, "missed_trade");
check("round 3: A2 missed the trade of A3", missed.length === 1 && missed[0].roundNumber === 3 && missed[0].enemy === B2 && missed[0].values[0].value < 900);
check("missed trade is the only chance A2 had", of(A2).tradeChances === 1 && of(A2).tradesMade === 0);
const untraded = moments(A3, "untraded_death");
check("round 17: A3 died isolated as CT → untraded death", untraded.length === 1 && untraded[0].roundNumber === 17 && untraded[0].costly);
check("untraded death: no finding when a teammate was close (A3 in round 3)", !of(A3).moments.some((m) => m.roundNumber === 3));

// ─── 3. Entry and lurk ───────────────────────────────────

const entry = moments(A1, "entry_death");
check("round 3: A1 first death as T, alone → entry death", entry.length === 1 && entry[0].roundNumber === 3 && entry[0].enemy === B1);
check("entry death is not also an untraded death", !moments(A1, "untraded_death").some((m) => m.roundNumber === 3));
const lurk = moments(A3, "lurk_death");
check("round 8: A3 died 4000 u from the team before the plant → lurk death", lurk.length === 1 && lurk[0].roundNumber === 8 && lurk[0].value >= 1800);

// ─── 4. Rotation ─────────────────────────────────────────

const rot = moments(A1, "early_rotation");
check("round 15: A1 left B before the plant with 1 enemy seen → early rotation",
  rot.length === 1 && rot[0].roundNumber === 15 && rot[0].values[1].value === 1 && rot[0].lost);
check("rotation moment is when A1 left, before the plant", rot[0] != null && rot[0].tick > 3000 && rot[0].tick < PLANT);
const noSpot = analyzeTactics({
  tickRate: TICK_RATE, kills, damages, bombs, economy, players,
  rounds: rounds.map((r) => (r.number === 15 ? { ...r, frames: r.frames.map((f) => ({ ...f, players: f.players.map((p) => ({ ...p, spottedBy: undefined })) })) } : r)),
});
check("without spotting data the rotation is not judged", !noSpot.some((p) => p.moments.some((m) => m.type === "early_rotation")));

// ─── 5. Post-plant, retake, clutch ───────────────────────

const pp = moments(B2, "postplant_death");
check("round 15: B2 died fighting after the plant 3v3 → post-plant death", pp.length === 1 && pp[0].values[0].value >= 15);
const retake = moments(A3, "retake_solo");
check("round 15: A3 went into the retake alone", retake.length === 1 && retake[0].roundNumber === 15);
const save = moments(A1, "clutch_decision").find((m) => m.variant === "save");
check("round 15: A1 last CT, 5 s left, died → clutch save", save != null && save.roundNumber === 15 && save.value <= 5.1);
const noPlant = moments(A2, "clutch_decision").find((m) => m.variant === "no_plant");
check("round 3: A2 last T, round lost on time without a plant", noPlant != null && noPlant.roundNumber === 3 && noPlant.value >= 15);

// ─── 6. Economy ──────────────────────────────────────────

const forces = allOf("bad_force");
check("round 5: all three A players flagged for the bad force", forces.length === 3 && forces.every((m) => m.roundNumber === 5) &&
  A.every((id) => forces.some((m) => m.steamId === id)));
check("bad force values: team equip, next round, estimated save", forces[0]?.values.length === 3 && forces[0].values[2].value >= 4000);
check("force stats", of(A1).forceRounds >= 1 && of(A1).badForces === 1);
const drop = allOf("no_drop");
check("round 7: A1 should have dropped A3", drop.length === 1 && drop[0].steamId === A1 && drop[0].detail.includes("A3"));
const money = allOf("death_with_money");
check("round 7: B1 died with 3500 $ unspent", money.some((m) => m.steamId === B1 && m.roundNumber === 7 && m.variant === "underbuy"));
check("round 12: B2 died with money that the half switch takes", money.some((m) => m.steamId === B2 && m.roundNumber === 12 && m.variant === "last_round"));
check("no money findings for well-spent players", !money.some((m) => m.steamId === B3));

// ─── 7. Predictable position ─────────────────────────────

const pred = moments(A1, "predictable_position");
check("A1 same spot in the 2nd half, killed there in 20 and 21", pred.length === 2 && pred.every((m) => m.costly) &&
  pred.map((m) => m.roundNumber).join() === "20,21");
check("same-spot stats", of(A1).anchorRounds === 6 && of(A1).sameSpotRounds === 5);
check("A2 switched spots every round → not predictable", moments(A2, "predictable_position").length === 0);

// ─── 8. Findings and metrics ─────────────────────────────

const drafts = detectFindings({ mechanics: [], aim: [], tactics: result.map((p) => ({ steamId: p.steamId, moments: p.moments })) });
const types = new Set(drafts.map((d) => d.type));
const S12: TacticsMomentType[] = [
  "untraded_death", "missed_trade", "entry_death", "lurk_death", "early_rotation", "postplant_death",
  "retake_solo", "clutch_decision", "bad_force", "no_drop", "death_with_money", "predictable_position",
];
check("every S12 type produced a finding", S12.every((t) => types.has(t)));
check("every S12 type is in the catalog with a teamplay/economy/positioning category", S12.every(
  (t) => ["teamplay", "economy", "positioning"].includes(FINDING_TYPES[t].category)
));
check("every finding: round, tick, values, advice", drafts.every((d) => d.roundNumber > 0 && d.tick >= 0 && d.advice.length > 20 && d.detail.length > 10));
check("clutch save gets the save advice", drafts.some((d) => d.type === "clutch_decision" && d.advice.includes("uratuj broń")));
check("lost-round rotation is high severity", drafts.some((d) => d.type === "early_rotation" && d.severity === "high"));

const metrics = playerMetrics(null, null, of(A1));
const keys = new Set(metrics.map((m) => m.key));
check("tactics metrics present", ["traded_deaths", "trades", "opening", "same_spot", "bad_force"].every((k) => keys.has(k)));
check("same spot judged (6 samples, 83%) as bad", metrics.find((m) => m.key === "same_spot")?.status === "bad");
check("trade rate over 1 chance is not judged", metrics.find((m) => m.key === "trades")?.status === "none");
const a1Report = buildReport(drafts.filter((d) => d.steamId === A1), metrics);
check("A1 report has positioning issues", a1Report.byCategory.find((c) => c.category.key === "positioning")!.issues.length > 0);
check("predictable position reaches A1's top 3", a1Report.top.some((i) => i.type === "predictable_position"));

// ─── 9. Isolated aggression (S31) ────────────────────────

{
  const SITES = { A: { x: 2000, y: 2000, z: 0 }, B: { x: -2000, y: -2000, z: 0 } };
  const iKills: TacticsKill[] = [];
  const iRounds: TacticsRound[] = [];
  const at = (x: number, y: number): Pos => ({ x, y });
  // A1 anchors B alone (A2, A3 in mid); B1 kills A1 at tick 3000 (setup spot: tick 2240).
  const scenario = (n: number, a1: Track, a2: Track) => {
    const deathPos = a1(3000);
    iKills.push({
      tick: 3000, roundNumber: n, attackerSteamId: B1, victimSteamId: A1,
      attackerPosX: -2000, attackerPosY: 0, attackerPosZ: 0, victimPosX: deathPos.x, victimPosY: deathPos.y, victimPosZ: 0,
    });
    const fr: TacticsFrame[] = [];
    for (let t = 0; t <= 4000; t += 4) {
      const tracks: Record<string, Track> = { [A1]: a1, [A2]: a2, [A3]: () => at(200, 0), [B1]: () => at(-2000, 500), [B2]: () => at(3000, 0), [B3]: () => at(3200, 0) };
      fr.push({
        tick: t,
        players: [...A, ...B].map((id) => ({
          steamId: id, team: A.includes(id) ? ("CT" as const) : ("T" as const),
          x: tracks[id](t).x, y: tracks[id](t).y, z: 0,
          velX: t >= FREEZE && id === B1 ? 100 : 0, velY: 0,
          isAlive: !(id === A1 && t >= 3000),
          spottedBy: [],
        })),
      });
    }
    iRounds.push({ number: n, startTick: 0, endTick: 4000, winner: "T", winReason: "ELIMINATION", ctScore: 0, tScore: n, frames: fr });
  };
  scenario(1, (t) => (t < 2600 ? at(-2000, -2000) : at(-2000, -1000)), () => at(0, 0)); // pushed out of B
  scenario(2, () => at(-2000, -2000), () => at(0, 0)); // held the spot
  scenario(3, (t) => (t < 2600 ? at(-2000, -2000) : at(-2000, -1000)), () => at(-1800, -1700)); // a teammate close
  const input = { tickRate: TICK_RATE, rounds: iRounds, kills: iKills, damages: [], bombs: [], economy: [], players };
  const iso = analyzeTactics(input, { sites: SITES });
  const a1 = iso.find((p) => p.steamId === A1)!;
  const agg = a1.moments.filter((m) => m.type === "isolated_aggression");
  check("lone B anchor pushed out of the site and died → isolated aggression", agg.length === 1 && agg[0].roundNumber === 1);
  check("isolated aggression: distance from the spot and the nearest teammate", agg[0]?.values[0].value === 1000 && agg[0]?.values[1].value >= 1200);
  check("…and says the site was left empty", agg[0]?.detail.includes("nie został nikt") === true);
  check("isolated aggression is not also an untraded death", !a1.moments.some((m) => m.roundNumber === 1 && m.type === "untraded_death"));
  check("holding the spot alone is not aggression (untraded at most)", !agg.some((m) => m.roundNumber === 2) &&
    a1.moments.some((m) => m.roundNumber === 2 && m.type === "untraded_death"));
  check("with a teammate close it is not isolated", !agg.some((m) => m.roundNumber === 3));
  const noSites = analyzeTactics(input);
  check("unknown sites (no callouts, no plants) → not judged", !noSites.some((p) => p.moments.some((m) => m.type === "isolated_aggression")));
  const withPlant = analyzeTactics({
    ...input,
    bombs: [{ tick: 3900, roundNumber: 1, type: "PLANTED", playerSteamId: B1, posX: -2000, posY: -2000, posZ: 0, site: "B" }],
  });
  const planted = withPlant.find((p) => p.steamId === A1)!.moments.find((m) => m.type === "isolated_aggression");
  check("plants stand in for unknown sites; a plant there is mentioned", planted?.detail.includes("podłożyli") === true);
  const isoDrafts = detectFindings({ mechanics: [], aim: [], tactics: [{ steamId: A1, moments: agg }] });
  check("isolated aggression finding: positioning, high in a lost round, passive play is fine in the advice",
    isoDrafts.length === 1 && isoDrafts[0].category === "positioning" && isoDrafts[0].severity === "high" &&
    isoDrafts[0].advice.includes("nie błąd"));
}

// ─── 10. Role-aware findings (S31) ───────────────────────

{
  const entryDraft = drafts.find((d) => d.type === "entry_death")!;
  const untradedDraft = drafts.find((d) => d.type === "untraded_death")!;
  const asEntry = applyRole(entryDraft, "entry");
  check("entry who dies untraded still gets the finding, same severity, entry advice",
    asEntry.severity === entryDraft.severity && asEntry.role === "entry" && asEntry.advice.includes("entry"));
  const asAwp = applyRole({ ...entryDraft, severity: "medium" }, "awp");
  check("AWP taking the first contact alone: one step more severe", asAwp.severity === "high" && asAwp.advice.includes("AWP"));
  check("severity never goes past high", applyRole({ ...entryDraft, severity: "high" }, "awp").severity === "high");
  const asAnchor = applyRole({ ...untradedDraft, severity: "high" }, "anchor");
  check("anchor dying untraded on his spot: one step milder", asAnchor.severity === "medium" && asAnchor.role === "anchor");
  check("severity never goes below low", applyRole({ ...untradedDraft, severity: "low" }, "anchor").severity === "low");
  const supportTrade = applyRole({ ...drafts.find((d) => d.type === "missed_trade")!, severity: "medium" }, "support");
  check("support missing a trade: more severe (it's the job)", supportTrade.severity === "high");
  const plain = drafts.find((d) => d.type === "bad_force")!;
  check("no rule for the type → unchanged, no role stored", applyRole(plain, "entry") === plain && plain.role === null);
  check("no role → unchanged", applyRole(entryDraft, null) === entryDraft);
  const roleDrafts = detectFindings({
    mechanics: [], aim: [], tactics: result.map((p) => ({ steamId: p.steamId, moments: p.moments })),
    roleOf: (id) => (id === A1 ? "awp" : null),
  });
  const a1Entry = roleDrafts.find((d) => d.steamId === A1 && d.type === "entry_death")!;
  check("detectFindings applies the round's role", a1Entry.role === "awp" && roleDrafts.length === drafts.length);
  check("every role rule has advice text", Object.values(ROLE_RULES).every((r) => Object.values(r ?? {}).every((x) => (x?.advice ?? "").length > 30)));
}

// ─── 11. After the explosion: CTs hunted while saving ───
{
  // Round 2: A on T, B on CT. Plant at 2000, explosion at 2000 + 40 s.
  const plantTick = 2000;
  const boom = plantTick + 40 * TICK_RATE;
  const pk: TacticsKill[] = [];
  const pkill = (rn: number, tick: number, attacker: string, victim: string, vx = 0) =>
    pk.push({
      tick, roundNumber: rn, attackerSteamId: attacker, victimSteamId: victim,
      attackerPosX: 0, attackerPosY: 0, attackerPosZ: 0, victimPosX: vx, victimPosY: 0, victimPosZ: 0,
    });
  // Round 2: B1 left alone before the explosion, hunted 3 s after it (exit frag).
  pkill(2, 2500, A1, B2);
  pkill(2, 2600, A1, B3);
  pkill(2, boom + 3 * TICK_RATE, A2, B1);
  // Round 3: B1 killed 3 s after the explosion, B3 alive 3000 u away (no retake possible).
  pkill(3, boom + 3 * TICK_RATE, A2, B1);
  const pos: Record<string, number> = { [B1]: 0, [B2]: 2500, [B3]: 3000, [A1]: 9000, [A2]: 200, [A3]: 9000 };
  const still3: TacticsFrame[] = [0, boom + 10 * TICK_RATE].map((tick) => ({
    tick,
    players: [...A, ...B].map((id) => ({
      steamId: id, team: A.includes(id) ? ("T" as const) : ("CT" as const),
      x: pos[id], y: 0, z: 0, velX: 0, velY: 0, isAlive: true,
    })),
  }));
  const pb = (rn: number): TacticsBomb => ({ tick: plantTick, roundNumber: rn, type: "PLANTED", playerSteamId: A1, posX: 0, posY: 0, posZ: 0, site: "A" });
  const post = analyzeTactics({
    tickRate: TICK_RATE,
    rounds: [
      { number: 2, startTick: 0, endTick: boom, winner: "T", winReason: "BOMB_EXPLODED", ctScore: 0, tScore: 2, frames: [] },
      { number: 3, startTick: 0, endTick: boom, winner: "T", winReason: "BOMB_EXPLODED", ctScore: 0, tScore: 3, frames: still3 },
    ],
    kills: pk, damages: [], bombs: [pb(2), pb(3)], economy: [], players, totalRounds: 24,
  });
  const b1 = post.find((p) => p.steamId === B1)!;
  check("hunted after the explosion while saving → no clutch 'save' (no negative time)",
    !b1.moments.some((m) => m.type === "clutch_decision"));
  check("killed after the explosion → no solo retake", !b1.moments.some((m) => m.type === "retake_solo"));
}

// ─── 12. Exit frags after the round end; money in the match's last round ───
{
  const ek: TacticsKill[] = [];
  const ekill = (rn: number, tick: number, attacker: string, victim: string) =>
    ek.push({
      tick, roundNumber: rn, attackerSteamId: attacker, victimSteamId: victim,
      attackerPosX: 0, attackerPosY: 0, attackerPosZ: 0, victimPosX: 0, victimPosY: 0, victimPosZ: 0,
    });
  // Round 4 (A on T): ends at 3000 by time; B1 (CT) hunted at 3200, teammates 2500 u away.
  ekill(4, 3200, A1, B1);
  // Round 24 (A on CT, final round of a 24-round match): B1 dies with $2000 left.
  ekill(24, 1000, A1, B1);
  const epos: Record<string, number> = { [B1]: 0, [B2]: 2500, [B3]: 2600, [A1]: 9000, [A2]: 9000, [A3]: 9000 };
  const eframes: TacticsFrame[] = [0, 3500].map((tick) => ({
    tick,
    players: [...A, ...B].map((id) => ({
      steamId: id, team: A.includes(id) ? ("T" as const) : ("CT" as const),
      x: epos[id], y: 0, z: 0, velX: 0, velY: 0, isAlive: true,
    })),
  }));
  const exitRes = analyzeTactics({
    tickRate: TICK_RATE,
    rounds: [
      { number: 4, startTick: 0, endTick: 3000, winner: "CT", winReason: "TIME_RAN_OUT", ctScore: 3, tScore: 1, frames: eframes },
      { number: 24, startTick: 0, endTick: 3000, winner: "CT", winReason: "ELIMINATION", ctScore: 13, tScore: 11, frames: [] },
    ],
    kills: ek, damages: [], bombs: [],
    economy: [{ roundNumber: 24, steamId: B1, equipValue: 4500, money: 2000 }],
    players, totalRounds: 24,
  });
  const eb1 = exitRes.find((p) => p.steamId === B1)!;
  check("killed after the round end → no untraded death, not counted as a death (only the round-24 one)",
    !eb1.moments.some((m) => m.roundNumber === 4) && eb1.deaths === 1);
  const end = eb1.moments.find((m) => m.type === "death_with_money" && m.roundNumber === 24);
  check("money in the match's final round: own variant, no side-change text",
    end?.variant === "match_end" && !end.detail.includes("zmianie stron"));
  const endDraft = detectFindings({ mechanics: [], aim: [], tactics: [{ steamId: B1, moments: end ? [end] : [] }] })[0];
  check("match-end money gets its own advice", !!endDraft && endDraft.advice.includes("meczu") && endDraft.severity === "medium");
}

// ─── Report ──────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
