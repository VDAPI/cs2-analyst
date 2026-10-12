/**
 * Regression test for the pro / rank norms (S13). Run: npm run test:norms
 *
 * 1. every report metric has a direction, a unit, a reference pro value, a
 *    /pro section and a PL/EN label,
 * 2. percentiles and the per-sample metric filter (small rates dropped, counts kept, weapon classes),
 * 3. aggregation into pro / all / rank pools, per map and all maps,
 * 4. lookup with the map → all maps fallback, reference fallback, standing vs pros,
 * 5. rank buckets and ranks from demo ticks,
 * 6. the side split (frames, regulation fallback) and round subsets,
 * 7. samples of a synthetic match: whole match plus per side, sides right per half.
 *
 * No demo file or database required — everything here is pure.
 */
import { playerMetrics, MIN_METRIC_SAMPLES, type ReportMetric } from "@/lib/findings/report";
import type { TacticsInput, TacticsKill, TacticsRound } from "@/lib/analysis/tactics";
import {
  aggregateNorms,
  betterThan,
  medianByMetric,
  METRIC_DIRECTION,
  metricsToSample,
  MIN_COUNT_ROUNDS,
  MIN_NORM_N,
  MIN_STORED_N,
  NormTable,
  percentile,
  proNorm,
  rankBucket,
  sampleKey,
  summarize,
  verdictVs,
  weaponClass,
  type NormSampleInput,
} from "@/lib/norms/norms";
import { REFERENCE_NORMS } from "@/lib/norms/reference";
import { METRIC_GROUPS, METRIC_UNIT, compareMetric, formatNormValue } from "@/lib/norms/view";
import { buildNormSamples, onlyRounds, splitRoundsBySide } from "@/lib/norms/build";
import { ranksFromTicks } from "@/lib/parsers/ranks";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ─── 1. Coverage of every report metric ──────────────────

const full = playerMetrics(
  {
    firstShots: 40, firstShotsMoving: 6, firstShotHits: 18, hits: 60, headHits: 15,
    counterStrafes: 30, counterStrafeAvgMs: 62,
  },
  {
    duels: 30, duelsUnseen: 2, crosshairSamples: 20, crosshairAvgDeg: 8, crosshairMedianDeg: 7, crosshairBad: 3,
    reactionSamples: 20, reactionMedianMs: 180, ttdSamples: 20, ttdMedianMs: 520, sprays: 10, sprayBullets: 60,
    sprayHits: 18, flicks: 10, trackings: 10, preaims: 12, overflicks: 3, peeks: 20, peeksWon: 11, dryPeeks: 10,
    dryPeeksLost: 4, noiseEpisodes: 6, noiseCostly: 1, jumps: 8, jumpsNearEnemy: 2, airShots: 0, reloads: 12,
    badReloads: 2, reloadData: true,
  },
  {
    rounds: 24, deaths: 16, tradedDeaths: 4, isolatedDeaths: 3, tradeChances: 8, tradesMade: 3, openingDuels: 6,
    openingWins: 3, anchorRounds: 10, sameSpotRounds: 6, forceRounds: 2, badForces: 0,
  },
  {
    smokes: 10, smokesVoid: 1, smokesEarly: 0, flashes: 12, flashesBlinding: 7, flashesFollowed: 5, flashEnemySec: 18,
    flashTeamSec: 3, teamFlashes: 2, hes: 6, heDamage: 80, molotovs: 6, molotovDamage: 40, nadeTeamDamage: 0,
    nadesNoEffect: 2, deaths: 16, deathsWithUtility: 6, unusedUtilityValue: 3200, inventoryData: true,
  }
);
const keys = full.map((m) => m.key);
check("playerMetrics returns 26 metrics for a full summary", keys.length === 26);
check("every metric has a direction", keys.every((k) => k in METRIC_DIRECTION));
check("every metric has a reference pro value", keys.every((k) => REFERENCE_NORMS[k] && REFERENCE_NORMS[k].p25 <= REFERENCE_NORMS[k].p75));
check("reference medians sit inside their range", keys.every((k) => REFERENCE_NORMS[k].p25 <= REFERENCE_NORMS[k].p50 && REFERENCE_NORMS[k].p50 <= REFERENCE_NORMS[k].p75));
check("METRIC_UNIT matches each metric's own unit", full.every((m) => METRIC_UNIT[m.key] === m.unit));
const grouped = METRIC_GROUPS.flatMap((g) => g.metrics);
check("/pro groups list every metric exactly once", grouped.length === keys.length && keys.every((k) => grouped.filter((g) => g === k).length === 1));
check("no stray directions without a metric", Object.keys(METRIC_DIRECTION).every((k) => keys.includes(k)));
check("PL and EN have a label per metric", keys.every((k) => k in pl.norms.metric && k in en.norms.metric));
check("PL and EN have a label per category", METRIC_GROUPS.every((g) => g.category in pl.norms.category && g.category in en.norms.category));

// A pro at the reference median must not land on the report's "bad" side:
// the bound is read from the threshold text ("…, > 100 ms źle").
const badSide = (m: ReportMetric, v: number): boolean => {
  const bad = /([<>])\s*([\d,]+)[^,]*źle/.exec(m.threshold.split(", ").pop() ?? "");
  if (!bad) return false;
  const bound = Number(bad[2].replace(",", "."));
  return bad[1] === ">" ? v > bound : v < bound;
};
check("no reference pro median falls on the report's 'bad' side", full.every((m) => !badSide(m, REFERENCE_NORMS[m.key].p50)));
check("the threshold parser reads decimal bounds", badSide(full.find((m) => m.key === "flash_blind")!, 0.5));

// ─── 2. Percentiles and samples ──────────────────────────

check("percentile interpolates", percentile([0, 10], 0.25) === 2.5 && percentile([1, 2, 3, 4, 5], 0.5) === 3);
const st = summarize([5, 1, 3, 2, 4]);
check("summarize sorts and reports n/p50/mean", st.n === 5 && st.p50 === 3 && st.mean === 3 && st.p10 === 1.4);

const sample = metricsToSample(
  [
    { key: "hs", type: "headshots", label: "", value: 30, unit: "%", threshold: "", status: "good", samples: 40, hint: "" },
    { key: "strafe", type: "late_strafe", label: "", value: 70, unit: "ms", threshold: "", status: "none", samples: MIN_METRIC_SAMPLES - 1, hint: "" },
    { key: "noise", type: "noise", label: "", value: 0, unit: "", threshold: "", status: "good", samples: 0, hint: "" },
    { key: "reload", type: "reload", label: "", value: null, unit: "", threshold: "", status: "none", samples: 3, hint: "" },
  ],
  [
    { weapon: "ak47", shots: 50, movingShots: 5, firstShots: 10, firstShotsMoving: 1, firstShotHits: 5, hits: 20, headHits: 6 },
    { weapon: "m4a1_silencer", shots: 20, movingShots: 2, firstShots: 10, firstShotsMoving: 3, firstShotHits: 3, hits: 10, headHits: 2 },
    { weapon: "awp", shots: 5, movingShots: 0, firstShots: 4, firstShotsMoving: 0, firstShotHits: 3, hits: 3, headHits: 0 },
    { weapon: "nova", shots: 9, movingShots: 0, firstShots: 9, firstShotsMoving: 0, firstShotHits: 9, hits: 9, headHits: 9 },
  ],
  24
);
check("rate metric kept with enough samples", sample[sampleKey("hs")]?.[0] === 30);
check("rate metric over too few samples dropped", !(sampleKey("strafe") in sample));
check("count metric kept at zero samples", sample[sampleKey("noise")]?.[0] === 0);
const counts = (rounds: number) =>
  metricsToSample([{ key: "jump", type: "jump", label: "", value: 3, unit: "", threshold: "", status: "good", samples: 9, hint: "" }], [], rounds);
check("counts are scaled to 24 rounds", counts(12)[sampleKey("jump")]?.[0] === 6 && counts(30)[sampleKey("jump")]?.[0] === 2.4);
check("counts over too few rounds are dropped", !(sampleKey("jump") in counts(MIN_COUNT_ROUNDS - 1)) && !(sampleKey("jump") in counts(0)));
check("null value dropped", !(sampleKey("reload") in sample));
check("rifles pooled per class (AK + M4)", sample[sampleKey("first_bullet", "rifle")]?.[0] === 40 && sample[sampleKey("moving_first", "rifle")]?.[0] === 20);
check("rifle HS per class", sample[sampleKey("hs", "rifle")]?.[0] === 27 && sample[sampleKey("hs", "rifle")]?.[1] === 30);
check("AWP below min samples dropped", !(sampleKey("first_bullet", "awp") in sample));
check("shotguns have no class", weaponClass("nova") === null && !Object.keys(sample).some((k) => k.endsWith("@null")));

// ─── 3. Aggregation ──────────────────────────────────────

const samples: NormSampleInput[] = [];
for (let i = 0; i < 10; i++) {
  samples.push({ map: "de_mirage", side: "all", pro: true, rank: null, metrics: { "hs@all": [20 + i, 50] } });
  samples.push({ map: "de_inferno", side: "all", pro: true, rank: null, metrics: { "hs@all": [30 + i, 50] } });
  samples.push({ map: "de_mirage", side: "all", pro: false, rank: i < 5 ? "faceit:7" : null, metrics: { "hs@all": [10 + i, 50] } });
}
samples.push({ map: "de_nuke", side: "CT", pro: true, rank: null, metrics: { "hs@all": [50, 50] } });
const rows = aggregateNorms(samples);
const row = (pool: string, map: string, side = "all") => rows.find((r) => r.pool === pool && r.map === map && r.side === side && r.metric === "hs");
check("pro pool per map", row("pro", "de_mirage")?.n === 10 && row("pro", "de_mirage")?.p50 === 24.5);
check("pro pool over all maps", row("pro", "all")?.n === 20);
check("players' pool excludes pros", row("all", "de_mirage")?.n === 10 && row("all", "de_mirage")?.p50 === 14.5);
check("rank pool only has ranked players", row("faceit:7", "de_mirage")?.n === 5);
check("cells under MIN_STORED_N are not stored", MIN_STORED_N > 1 && row("pro", "de_nuke", "CT") === undefined);

// ─── 4. Lookup and standing ──────────────────────────────

const table = new NormTable(rows);
check("map cell used when big enough", table.get("pro", "hs", { map: "de_mirage" }, 10)?.map === "de_mirage");
check("falls back to all maps when the map is small", table.get("pro", "hs", { map: "de_mirage" }, 11)?.map === "all");
check("null when neither is big enough", table.get("faceit:7", "hs", { map: "de_mirage" }, MIN_NORM_N) === null);
const measured = proNorm(table, "hs", { map: "de_inferno" });
check("measured pro norm", measured?.source === "pro" && measured.map === "de_inferno" && measured.n === 10);
const ref = proNorm(table, "strafe", { map: "de_inferno" });
check("reference fallback without pro data", ref?.source === "reference" && ref.p50 === REFERENCE_NORMS.strafe.p50 && ref.p10 === null);
check("no reference per weapon class", proNorm(null, "hs", { situation: "rifle" }) === null);
const norm = { p10: 10, p25: 20, p50: 30, p75: 40, p90: 50 };
check("betterThan, higher is better", betterThan(30, norm, "higher") === 50 && betterThan(45, norm, "higher") === 83);
check("betterThan, lower is better", betterThan(20, norm, "lower") === 75 && betterThan(60, norm, "lower") === 5);
check("ties take the middle of the tied range", betterThan(0, { p10: 0, p25: 0, p50: 0, p75: 1, p90: 2 }, "lower") === 70);
check("betterThan needs measured tails", betterThan(30, { ...norm, p10: null, p90: null }, "higher") === null);
check("verdict vs the middle half", verdictVs(45, norm, "higher") === "better" && verdictVs(45, norm, "lower") === "worse" && verdictVs(25, norm, "lower") === "within");
const cmpTable = new NormTable(aggregateNorms(Array.from({ length: 10 }, (_, i) => ({ map: "de_mirage", side: "all" as const, pro: true, rank: null, metrics: { "hs@all": [20 + i, 50] as [number, number], "jump@all": [i % 3, 24] as [number, number] } }))));
const tiny = compareMetric({ key: "hs", value: 100, unit: "%", samples: 2 }, cmpTable, {}, null);
check("rate over too few samples: norms shown, no standing", tiny.pro?.source === "pro" && tiny.betterThanPro === null && tiny.verdict === null);
const jumps = compareMetric({ key: "jump", value: 1, unit: "", samples: 5 }, cmpTable, {}, null, 12);
check("count compared per 24 rounds (1 in 12 rounds = 2)", jumps.betterThanPro === betterThan(2, jumps.pro!, "lower"));
check("median per metric over matches", medianByMetric([{ "hs@all": [10, 9] }, { "hs@all": [30, 9] }, { "hs@all": [20, 9] }])["hs@all"]?.value === 20);
check("formatNormValue rounds by unit", formatNormValue(1.46, "s") === "1.5 s" && formatNormValue(24.6, "%") === "25%" && formatNormValue(2.25, "") === "2.3");

// ─── 5. Ranks ────────────────────────────────────────────

check("FACEIT level bucket", rankBucket("faceit", 7) === "faceit:7" && rankBucket("faceit", 11) === null);
check("Premier rating bucket", rankBucket("premier", 15873) === "premier:15000" && rankBucket("premier", 33000) === "premier:30000");
check("skill group bucket", rankBucket("competitive", 18) === "competitive:18" && rankBucket("competitive", 0) === null);
check("unknown rank", rankBucket(null, 5) === null && rankBucket("premier", 0) === null);
const demoRanks = ranksFromTicks([
  { steamid: "1", rank: 14000, comp_rank_type: 11, tick: 100 },
  { steamid: "1", rank: 14250, comp_rank_type: 11, tick: 900 },
  { steamid: "2", rank: 9, comp_rank_type: 12, tick: 900 },
  { steamid: "3", rank: 0, comp_rank_type: 11, tick: 900 },
  { steamid: "4", rank: 5, comp_rank_type: 7, tick: 900 },
]);
check("demo ranks: latest tick wins, premier + competitive kept", demoRanks.length === 2 && demoRanks.find((r) => r.steamId === "1")?.value === 14250 && demoRanks.find((r) => r.steamId === "2")?.type === "competitive");

// ─── 6. Side split ───────────────────────────────────────

const A = ["a1", "a2"];
const B = ["b1", "b2"];
const players = [...A.map((s) => ({ steamId: s, team: "CT" as const })), ...B.map((s) => ({ steamId: s, team: "T" as const }))];
const frame = (aSide: "CT" | "T") => ({
  players: [
    ...A.map((s) => ({ steamId: s, team: aSide })),
    ...B.map((s) => ({ steamId: s, team: aSide === "CT" ? ("T" as const) : ("CT" as const) })),
  ],
});
const withFrames = Array.from({ length: 24 }, (_, i) => ({ number: i + 1, frames: [frame(i < 12 ? "T" : "CT")] }));
const g1 = splitRoundsBySide({ rounds: withFrames, players });
check("two side groups", g1.length === 2);
const aCt = g1.find((g) => g.sideOf.get("a1") === "CT")!;
check("team A was CT in the second half", aCt.rounds.has(13) && !aCt.rounds.has(12) && aCt.rounds.size === 12);
check("in that group team B is T", aCt.sideOf.get("b1") === "T");
const noFrames = Array.from({ length: 22 }, (_, i) => ({ number: i + 1, frames: [] }));
const g2 = splitRoundsBySide({ rounds: noFrames, players });
check("regulation fallback without frames", g2.find((g) => g.sideOf.get("a1") === "T")?.rounds.has(5) === true && g2.find((g) => g.sideOf.get("a1") === "CT")?.rounds.has(20) === true);
const ot = Array.from({ length: 30 }, (_, i) => ({ number: i + 1, frames: [] }));
check("overtime match without frames is not guessed", splitRoundsBySide({ rounds: ot, players }).length === 0);
const sub = onlyRounds({ tickRate: 64, rounds: [{ number: 1 }, { number: 2 }], kills: [{ roundNumber: 1 }, { roundNumber: 2 }], players: [{ steamId: "x" }] }, new Set([2]));
check("onlyRounds filters rounds and events, keeps the rest", sub.rounds.length === 1 && sub.kills.length === 1 && sub.kills[0].roundNumber === 2 && sub.players.length === 1 && sub.tickRate === 64);

// ─── 7. Samples of a synthetic match ─────────────────────

// 24 rounds without frames; a1 opens every round by killing b1. A finished on CT (T first half).
const rounds: TacticsRound[] = Array.from({ length: 24 }, (_, i) => ({
  number: i + 1,
  startTick: i * 10000,
  endTick: i * 10000 + 8000,
  winner: i < 12 ? "T" : "CT",
  winReason: "ELIMINATION",
  ctScore: 0,
  tScore: 0,
  frames: [],
}));
const kills: TacticsKill[] = rounds.map((r) => ({
  tick: r.startTick + 3000,
  roundNumber: r.number,
  attackerSteamId: "a1",
  victimSteamId: "b1",
  attackerPosX: 0, attackerPosY: 0, attackerPosZ: 0, victimPosX: 500, victimPosY: 0, victimPosZ: 0,
}));
const tactics: TacticsInput = {
  tickRate: 64,
  rounds,
  kills,
  damages: [],
  bombs: [],
  economy: [],
  players: players.map((p) => ({ ...p, name: p.steamId })),
};
const built = buildNormSamples({
  map: "de_mirage",
  pro: true,
  players: players.map((p) => ({ ...p, rank: null })),
  mechanics: null,
  aim: null,
  tactics,
  utility: null,
});
const of = (id: string, side: string) => built.find((s) => s.steamId === id && s.side === side);
check("whole-match sample for the opener", of("a1", "all")?.metrics["opening@all"]?.[0] === 100 && of("a1", "all")?.metrics["opening@all"]?.[1] === 24);
check("per-side samples for both halves", of("a1", "CT")?.metrics["opening@all"]?.[1] === 12 && of("a1", "T")?.metrics["opening@all"]?.[1] === 12);
check("victim's side samples present", of("b1", "CT")?.metrics["opening@all"]?.[0] === 0 && of("b1", "T") !== undefined);
check("samples carry map and pro flag", built.every((s) => s.map === "de_mirage" && s.pro));
check("a player with no duels keeps only per-match counts", of("a2", "all") !== undefined && !("opening@all" in of("a2", "all")!.metrics) && of("a2", "all")!.metrics["bad_force@all"]?.[0] === 0);
check("per-side counts carry the side's rounds", of("a2", "T")?.metrics["bad_force@all"]?.[1] === 12);

// ─── Report ──────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
