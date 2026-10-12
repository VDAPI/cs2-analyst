/**
 * Regression test for the round win-probability model (S14). Run: npm run test:winprob
 *
 * 1. features: alive from the kill feed, HP, primary weapon kept while holding
 *    the knife, round/bomb clock, defuse race, NaN before the plant,
 *    counterfactuals (revive, kill, drop),
 * 2. snapshots: grid + kill/plant ticks, nothing after the result is decided,
 * 3. scoring: the prior is monotone where it must be; the TypeScript tree
 *    scorer matches LightGBM on the committed fixture (ml/make_fixture.py),
 * 4. impact: "kosztowało team X pp" for a death, a team flash, a missed trade
 *    and a missing drop; no number for types without a rule,
 * 5. WPA and the replay series,
 * 6. "co zrobiłby pro": actions, similarity search and its summary.
 *
 * No demo file, database or Python required — everything here is pure.
 */
import { readFileSync } from "fs";
import path from "path";
import {
  buildRoundContext,
  matchSnapshots,
  siteCenters,
  snapshotTicks,
  stateAt,
  WP_FEATURES,
  type WpFrame,
  type WpFramePlayer,
  type WpRound,
} from "@/lib/winprob/features";
import { predictT, rawScore, type GbdtModel } from "@/lib/winprob/model";
import { PRIOR_MODEL } from "@/lib/winprob/prior";
import { findingImpact, IMPACT_RULE, impactPp } from "@/lib/winprob/impact";
import { matchWpa, roundSeries } from "@/lib/winprob/series";
import { actionAfter, similarSituations, situationAt, situationDistance, type Candidate } from "@/lib/winprob/situations";
import { FINDING_TYPES } from "@/lib/findings/catalog";
import { findingsStamp } from "@/lib/findings/persist";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

const TR = 64;
const FREEZE_END = 15 * TR; // 960
const S = (sec: number) => FREEZE_END + Math.round(sec * TR);

const T1 = "76561190000000001";
const T2 = "76561190000000002";
const C1 = "76561190000000011";
const C2 = "76561190000000012";

type Track = (tick: number) => Partial<WpFramePlayer>;

function frames(endTick: number, tracks: Record<string, { team: "CT" | "T"; at: Track }>): WpFrame[] {
  const out: WpFrame[] = [];
  for (let tick = 0; tick <= endTick; tick += 4) {
    out.push({
      tick,
      players: Object.entries(tracks).map(([steamId, t]) => ({
        steamId,
        team: t.team,
        x: 0,
        y: 0,
        z: 0,
        velX: 0,
        velY: 0,
        health: 100,
        armor: 100,
        isAlive: true,
        weapon: "knife",
        ...t.at(tick),
      })),
    });
  }
  return out;
}

const moving = (tick: number) => (tick >= FREEZE_END ? 250 : 0);
// Site A at (2000, 0, 0); site B at (-2000, 0, 0).
const SITES = siteCenters(
  [
    { place: "BombsiteA", x: 2000, y: 0, z: 0, count: 10 },
    { place: "BombsiteB", x: -2000, y: 0, z: 0, count: 10 },
  ],
  []
);
check("sites: centres from callouts", SITES.A?.x === 2000 && SITES.B?.x === -2000);
check(
  "sites: plants as fallback",
  siteCenters([], [{ site: "BombsiteA", x: 10, y: 20, z: 0 }, { site: "A", x: 30, y: 20, z: 0 }]).A?.x === 20
);

// Round 1: T1 (AK, then knife) and T2 go A; C1 kills T2 at 20 s; T1 plants at 40 s;
// C2 kills T1 at 45 s; C1 starts the defuse at 60 s and defuses.
const R1_END = S(70);
const round1: WpRound = {
  number: 1,
  startTick: 0,
  endTick: R1_END,
  winner: "CT",
  winReason: "BOMB_DEFUSED",
  frames: frames(R1_END, {
    [T1]: {
      team: "T",
      at: (t) => ({
        x: Math.min(1900, (Math.max(0, t - FREEZE_END) / TR) * 120),
        velX: moving(t),
        weapon: t < S(10) ? "AK-47" : "knife",
        isAlive: t < S(45),
        health: t < S(45) ? (t > S(30) ? 40 : 100) : 0,
      }),
    },
    [T2]: { team: "T", at: (t) => ({ x: 500, y: 300, weapon: "Glock-18", isAlive: t < S(20), health: t < S(20) ? 100 : 0 }) },
    [C1]: { team: "CT", at: (t) => ({ x: 2200, y: 300, weapon: "M4A1-S", velX: moving(t) }) },
    [C2]: { team: "CT", at: (t) => ({ x: t > S(50) ? 1800 : -1500, y: -800, weapon: "AWP" }) },
  }),
  kills: [
    { tick: S(20), attackerSteamId: C1, victimSteamId: T2 },
    { tick: S(45), attackerSteamId: C2, victimSteamId: T1 },
  ],
  bombs: [
    { tick: S(39), type: "PLANT_BEGIN", playerSteamId: T1, posX: 1900, posY: 0, posZ: 0, site: "A" },
    { tick: S(40), type: "PLANTED", playerSteamId: T1, posX: 1900, posY: 0, posZ: 0, site: "A" },
    { tick: S(60), type: "DEFUSE_BEGIN", playerSteamId: C1, posX: 1900, posY: 0, posZ: 0, site: "A" },
    { tick: S(65), type: "DEFUSED", playerSteamId: C1, posX: 1900, posY: 0, posZ: 0, site: "A" },
  ],
  grenades: [{ tick: S(5), throwerSteamId: T1 }, { tick: S(25), throwerSteamId: C2 }],
  equip: { [T1]: 3700, [T2]: 800, [C1]: 5000, [C2]: 5700 },
};

const ctx = buildRoundContext(round1, TR, SITES);

// ─── 1. Features ─────────────────────────────────────────
check("freeze end from the first movement", ctx.freezeEnd === FREEZE_END);
check("decided at the defuse", ctx.decided === S(65));
const f10 = stateAt(ctx, S(5));
check("2v2 at the start", f10.t_alive === 2 && f10.ct_alive === 2 && f10.alive_diff === 0);
check("round clock 110 s", near(f10.time_left, 110, 0.05) && f10.planted === 0);
check("time pressure grows as the clock runs", stateAt(ctx, S(35)).time_pressure > f10.time_pressure);
check("bomb features NaN before the plant", Number.isNaN(f10.ct_bomb_dist) && Number.isNaN(f10.defuse_margin));
check("site distance before the plant", Number.isFinite(f10.t_site_dist) && Number.isFinite(f10.ct_site_dist));
check("equipment of alive players (k$)", near(f10.t_equip, 4.5) && near(f10.ct_equip, 10.7));
check("average equipment difference", near(f10.equip_avg_diff, (2250 - 5350) / 1000, 0.01));
check("rifles and AWPs", f10.t_rifles === 1 && f10.ct_rifles === 2 && f10.ct_awps === 1);
const f15 = stateAt(ctx, S(15));
check("AK still counted while T1 holds the knife", f15.t_rifles === 1);
check("utility used so far", f15.t_util_used === 1 && f15.ct_util_used === 0 && stateAt(ctx, S(30)).ct_util_used === 1 && f10.t_util_used === 1 && stateAt(ctx, S(4)).t_util_used === 0);
const atKill = stateAt(ctx, S(20));
const beforeKill = stateAt(ctx, S(20) - 1);
check("kill counts from its exact tick", beforeKill.t_alive === 2 && atKill.t_alive === 1);
check("HP of alive players only", atKill.t_hp === 100 && stateAt(ctx, S(31)).t_hp === 40);
const fPlant = stateAt(ctx, S(41));
check("bomb clock after the plant", fPlant.planted === 1 && near(fPlant.time_left, 39, 0.05));
check("CT distance to the bomb", near(fPlant.ct_bomb_dist, Math.hypot(300, 300) / 1000, 0.01));
check("defuse race margin (capped)", fPlant.defuse_margin === 10 && fPlant.defuse_short === 0);
check("no site distance after the plant", Number.isNaN(fPlant.t_site_dist));
check("defusing flag", stateAt(ctx, S(61)).defusing === 1 && stateAt(ctx, S(59)).defusing === 0);
const revived = stateAt(ctx, S(31), { revive: [T2] });
check("counterfactual: revive", revived.t_alive === 2 && revived.t_hp === 140);
check("counterfactual: kill", stateAt(ctx, S(30), { kill: [C1] }).ct_alive === 1);
const dropped = stateAt(ctx, S(5), { addEquip: { [T2]: 2700 }, addRifle: [T2] });
check("counterfactual: drop", dropped.t_rifles === 2 && near(dropped.t_equip, 7.2));

// ─── 2. Snapshots ────────────────────────────────────────
const ticks = snapshotTicks(ctx);
check("snapshots: kill and plant ticks included", ticks.includes(S(20)) && ticks.includes(S(45)) && ticks.includes(S(40)));
check("snapshots: nothing at or after the result", ticks.every((t) => t >= FREEZE_END && t < ctx.decided));
const snaps = matchSnapshots({ tickRate: TR, sites: SITES, rounds: [round1, { ...round1, number: 2, frames: [] }] });
check("snapshots: rounds without frames skipped", snaps.every((s) => s.roundNumber === 1) && snaps.length === ticks.length);
check("snapshots: label is the round result", snaps.every((s) => s.tWin === 0));
check("snapshots: one value per feature", snaps.every((s) => s.features.length === WP_FEATURES.length));

// ─── 3. Scoring ──────────────────────────────────────────
check("prior: terms use known features", PRIOR_MODEL.terms.every((t) => t.f.every((f) => (WP_FEATURES as readonly string[]).includes(f))));
const base = stateAt(ctx, S(5));
const withAlive = (t: number, c: number) => ({
  ...base,
  equip_avg_diff: 0,
  t_alive: t,
  ct_alive: c,
  t_hp: 100 * t,
  ct_hp: 100 * c,
  alive_diff: t - c,
  alive_log_ratio: Math.log((t + 0.5) / (c + 0.5)),
});
const pAlive = [1, 2, 3, 4, 5].map((t) => predictT(PRIOR_MODEL, withAlive(t, 3)));
check("prior: more T alive → higher", pAlive.every((p, i) => i === 0 || p > pAlive[i - 1]));
const pCt = [1, 2, 3, 4, 5].map((c) => predictT(PRIOR_MODEL, withAlive(3, c)));
check("prior: more CT alive → lower", pCt.every((p, i) => i === 0 || p < pCt[i - 1]));
const even = predictT(PRIOR_MODEL, withAlive(5, 5));
check("prior: 5v5 at the start ≈ 50%", even > 0.4 && even < 0.6);
const p54 = predictT(PRIOR_MODEL, withAlive(5, 4));
check("prior: 5v4 ≈ 70%", p54 > 0.62 && p54 < 0.8);
check("prior: the plant helps T", predictT(PRIOR_MODEL, fPlant) > predictT(PRIOR_MODEL, { ...fPlant, planted: 0, defuse_margin: NaN, time_pressure: 0.2 }));
check("prior: CT too far to defuse ≈ T wins", predictT(PRIOR_MODEL, { ...withAlive(1, 2), planted: 1, time_pressure: 0, defuse_margin: -8, defuse_short: 8 }) > 0.8);
check("prior: a defuse under way helps CT", predictT(PRIOR_MODEL, { ...fPlant, defusing: 1 }) < predictT(PRIOR_MODEL, fPlant));
check("prior: no time left before the plant ≈ lost for T", predictT(PRIOR_MODEL, { ...withAlive(5, 1), time_pressure: 1 }) < 0.5);
check("prior: full buy vs eco", predictT(PRIOR_MODEL, { ...withAlive(5, 5), equip_avg_diff: 4.2 }) > 0.9);

const fixture = JSON.parse(readFileSync(path.join(process.cwd(), "scripts/fixtures/winprob-gbdt.json"), "utf8")) as {
  model: GbdtModel;
  probes: (number | null)[][];
  expected: number[];
};
check("fixture: features are WP_FEATURES in order", JSON.stringify(fixture.model.features) === JSON.stringify(WP_FEATURES));
let worst = 0;
fixture.probes.forEach((row, i) => {
  const feats = Object.fromEntries(fixture.model.features.map((f, j) => [f, row[j] ?? NaN]));
  worst = Math.max(worst, Math.abs(predictT(fixture.model, feats) - fixture.expected[i]));
});
check(`gbdt scorer matches LightGBM (max diff ${worst.toExponential(1)})`, worst < 1e-9);
check("gbdt: missing features score like NaN", Number.isFinite(rawScore(fixture.model, {})));

// ─── 4. Impact ───────────────────────────────────────────
check("impact rules only for known types", Object.keys(IMPACT_RULE).every((t) => t in FINDING_TYPES));
const death = findingImpact({ type: "untraded_death", steamId: T2, roundNumber: 1, tick: S(20), targetSteamId: C1 }, ctx, PRIOR_MODEL);
check("death: costs T's chances", death != null && death.kind === "death" && death.after < death.before && impactPp(death) < -1);
const lateMech = findingImpact({ type: "moving_shot", steamId: T2, roundNumber: 1, tick: S(19), targetSteamId: C1 }, ctx, PRIOR_MODEL);
check("mechanics: the death right after the shot", lateMech != null && lateMech.tick === S(20));
check(
  "mechanics: no death in the window → no number",
  findingImpact({ type: "moving_shot", steamId: C1, roundNumber: 1, tick: S(20), targetSteamId: T2 }, ctx, PRIOR_MODEL) == null
);
const flash = findingImpact({ type: "team_flash", steamId: T1, roundNumber: 1, tick: S(18), targetSteamId: null }, ctx, PRIOR_MODEL);
check("team flash: the flashed mate's death", flash?.kind === "mate_death" && flash.tick === S(20) && flash.after < flash.before);
const trade = findingImpact({ type: "missed_trade", steamId: T1, roundNumber: 1, tick: S(20), targetSteamId: C1 }, ctx, PRIOR_MODEL);
check("missed trade: actual worse than traded", trade?.kind === "trade" && trade.after < trade.before);
const drop = findingImpact({ type: "no_drop", steamId: T1, roundNumber: 1, tick: FREEZE_END, targetSteamId: null }, ctx, PRIOR_MODEL);
check("no drop: actual worse than with the drop", drop?.kind === "drop" && drop.after < drop.before);
check(
  "no rule → no number",
  findingImpact({ type: "smoke_early", steamId: T1, roundNumber: 1, tick: S(15), targetSteamId: null }, ctx, PRIOR_MODEL) == null
);
check("no frames → no number", findingImpact({ type: "untraded_death", steamId: T2, roundNumber: 1, tick: S(20), targetSteamId: C1 }, undefined, PRIOR_MODEL) == null);
check("impactPp rounds to one decimal", impactPp({ before: 0.5, after: 0.3567 }) === -14.3);
check("findings stamp names the model", findingsStamp("abc").endsWith(":abc") && findingsStamp("prior") !== findingsStamp("abc"));

// ─── 5. WPA and series ───────────────────────────────────
const wpa = matchWpa({ tickRate: TR, sites: SITES, rounds: [round1] }, PRIOR_MODEL);
const w = (id: string) => wpa.find((p) => p.steamId === id)!;
check("WPA: killers gain, victims lose", w(C1).total > 0 && w(C2).total > 0 && w(T2).total < 0 && w(T1).total < 0);
check("WPA: a kill moves both sides equally", near(w(C1).fromKills, -w(T2).fromDeaths, 1e-9));
check("WPA: rounds counted", w(T1).rounds === 1);
const series = roundSeries(ctx, PRIOR_MODEL);
check("series: points over the live round", series != null && series.points[0].tick === FREEZE_END && series.points.at(-1)!.tick === ctx.decided);
check("series: ends at the result", series?.points.at(-1)?.ct === 1);
check(
  "series: kill and plant events with jumps",
  series != null &&
    series.events.filter((e) => e.kind === "kill").length === 2 &&
    series.events.some((e) => e.kind === "plant" && e.after < e.before) &&
    series.events.some((e) => e.kind === "defuse")
);

// ─── 6. Co zrobiłby pro ──────────────────────────────────
const sit = situationAt(ctx, T1, S(30));
check("situation: side, counts, clock", sit != null && sit.side === "T" && sit.aliveUs === 1 && sit.aliveThem === 2 && !sit.planted);
check("situation: dead player has none", situationAt(ctx, T2, S(30)) == null);
check("action: plant", actionAfter(ctx, T1, S(36))?.action === "plant");
check("action: utility", actionAfter(ctx, T1, S(1))?.action === "utility");
check("action: push (closing in on the enemy)", actionAfter(ctx, T1, S(10))?.action === "push");
check("action: hold", actionAfter(ctx, C1, S(22))?.action === "hold");
check("action: died flag", actionAfter(ctx, T2, S(17))?.died === true);
check("action: C2 repositions to the bomb", ["push", "reposition"].includes(actionAfter(ctx, C2, S(47))?.action ?? ""));

const q = { side: "T" as const, aliveUs: 2, aliveThem: 3, planted: false, timeLeft: 40, x: 0, y: 0, z: 0, hp: 100 };
check("distance: side must match", situationDistance(q, { ...q, side: "CT" }) === Infinity);
check("distance: closer is smaller", situationDistance(q, { ...q, x: 100 }) < situationDistance(q, { ...q, x: 1500 }));
const cand = (i: number, over: Partial<Candidate>): Candidate => ({
  ...q,
  id: `c${i}`,
  action: "hold",
  kill: false,
  died: false,
  wpBefore: 0.3,
  wpAfter: 0.3,
  ...over,
});
const pool: Candidate[] = [
  ...Array.from({ length: 6 }, (_, i) => cand(i, { x: i * 50, action: "fall_back", wpAfter: 0.35 })),
  ...Array.from({ length: 5 }, (_, i) => cand(20 + i, { x: 2000 + i * 50, action: "push", wpAfter: 0.2, died: true })),
  ...Array.from({ length: 10 }, (_, i) => cand(40 + i, { aliveThem: 2, action: "plant" })),
];
const res = similarSituations(q, pool);
check("search: few exact matches → widened", !res.exact && res.n === 21);
check("search: nearest first", res.nearest[0].x === 0 && res.nearest[0].aliveThem === 3);
check("search: shares sum to 1", near(res.actions.reduce((a, s) => a + s.share, 0), 1, 0.02));
check("search: most common action first", res.actions[0].action === "fall_back");
const fb = res.actions.find((a) => a.action === "fall_back")!;
const push = res.actions.find((a) => a.action === "push")!;
check("search: average change per action", fb.avgDeltaPp === 5 && push.avgDeltaPp === -10 && push.diedShare === 1);
const exactPool = Array.from({ length: 15 }, (_, i) => cand(i, { x: i * 10 }));
check("search: enough exact matches → exact only", similarSituations(q, [...exactPool, ...pool.slice(20)]).exact);

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed > 0) process.exit(1);
