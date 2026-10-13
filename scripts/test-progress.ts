/**
 * Regression test for progress over time and sharing (S16).
 * Run: npm run test:progress
 *
 * Checks:
 * 1. metric table: every report metric has a progress definition and direction,
 * 2. per-match values, result from the player's final side, history order,
 * 3. window aggregate: summed counts judged as one sample, per-match counts averaged,
 * 4. trend: better / worse / flat, by direction, needs enough matches,
 * 5. goals: met on the last-5 average, progress bar, suggestions, target validation,
 * 6. badges: earned on the first qualifying match, locked progress,
 * 7. who the user is: Steam, FACEIT nickname, most frequent, ambiguous,
 * 8. share tokens, profile slugs, deep links, canvas ↔ world round trip,
 * 9. PL/EN copy for every progress metric and badge.
 *
 * No demo file or database required — everything here is pure.
 */
import { playerMetrics, type AimSummary, type MechanicsSummary, type TacticsSummary, type UtilitySummary } from "@/lib/findings/report";
import {
  MIN_TREND_POINTS,
  PROGRESS_METRICS,
  aggregateAim,
  aggregateTactics,
  aggregateUtility,
  aggregateWindow,
  buildHistory,
  computeTrend,
  matchResult,
  meets,
  progressMetric,
  type MatchInput,
} from "@/lib/progress/metrics";
import { formatDelta, formatProgressValue } from "@/lib/progress/format";
import { GOAL_WINDOW, evaluateGoal, suggestGoals, validTarget } from "@/lib/progress/goals";
import { BADGE_KEYS, BADGE_RULES, computeBadges } from "@/lib/progress/badges";
import { resolvePlayer } from "@/lib/progress/identity";
import { buildProgressView } from "@/lib/progress/view";
import {
  isShareToken,
  parseRoundParam,
  isValidSlug,
  momentReplayPath,
  normalizeSlug,
  profilePath,
  sharePath,
  suggestSlug,
} from "@/lib/sharing/share";
import { newShareToken } from "@/lib/sharing/token";
import { makeCanvasToWorld, makeWorldToCanvas } from "@/lib/canvas/radar";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const near = (a: number | null, b: number, eps = 0.01) => a != null && Math.abs(a - b) <= eps;

// ─── Fixtures ──────────────────────────────────────────────

const mech = (over: Partial<MechanicsSummary> = {}): MechanicsSummary => ({
  firstShots: 20, firstShotsMoving: 4, firstShotHits: 6, hits: 30, headHits: 12,
  counterStrafes: 15, counterStrafeAvgMs: 120, ...over,
});

const aim = (over: Partial<AimSummary> = {}): AimSummary => ({
  duels: 20, duelsUnseen: 2,
  crosshairSamples: 10, crosshairAvgDeg: 9, crosshairMedianDeg: 8, crosshairBad: 2,
  reactionSamples: 10, reactionMedianMs: 320, ttdSamples: 8, ttdMedianMs: 600,
  sprays: 5, sprayBullets: 40, sprayHits: 10,
  flicks: 6, trackings: 4, preaims: 5, overflicks: 2,
  peeks: 10, peeksWon: 6, dryPeeks: 6, dryPeeksLost: 3,
  noiseEpisodes: 2, noiseCostly: 1, jumps: 4, jumpsNearEnemy: 1, airShots: 0,
  reloads: 6, badReloads: 1, reloadData: true, ...over,
});

const tactics = (over: Partial<TacticsSummary> = {}): TacticsSummary => ({
  rounds: 22, deaths: 15, tradedDeaths: 4, isolatedDeaths: 3, tradeChances: 6, tradesMade: 3,
  openingDuels: 6, openingWins: 3, anchorRounds: 10, sameSpotRounds: 6, forceRounds: 2, badForces: 1, ...over,
});

const utility = (over: Partial<UtilitySummary> = {}): UtilitySummary => ({
  smokes: 8, smokesVoid: 2, smokesEarly: 1, flashes: 10, flashesBlinding: 6, flashesFollowed: 3,
  flashEnemySec: 12, flashTeamSec: 3, teamFlashes: 1, hes: 4, heDamage: 60, molotovs: 3, molotovDamage: 30,
  nadeTeamDamage: 0, nadesNoEffect: 3, deaths: 15, deathsWithUtility: 5, unusedUtilityValue: 1500, inventoryData: true, ...over,
});

let seq = 0;
const match = (over: Partial<MatchInput> & { day: number; p?: Partial<MatchInput["player"]> }): MatchInput => {
  const { day, p, ...rest } = over;
  seq++;
  return {
    matchId: `m${String(seq).padStart(3, "0")}`,
    date: new Date(Date.UTC(2026, 8, day)).toISOString(),
    map: "de_mirage",
    scoreCT: 13,
    scoreT: 9,
    rounds: 22,
    player: {
      name: "gracz", team: "CT", kills: 18, deaths: 15, adr: 82, hltvRating: 1.12, hsPercent: 45,
      firstKills: 2, clutchWins: 0, ...p,
    },
    mech: mech(),
    aim: aim(),
    tactics: tactics(),
    utility: utility(),
    findings: { high: 2, medium: 3, low: 4 },
    ...rest,
  };
};

// ─── 1. Metric table ───────────────────────────────────────

const reportKeys = playerMetrics(mech(), aim(), tactics(), utility()).map((m) => m.key);
check(
  "every report metric is tracked over time",
  reportKeys.every((k) => PROGRESS_METRICS.some((d) => d.key === k && d.source === "report"))
);
check("progress metric keys are unique", new Set(PROGRESS_METRICS.map((d) => d.key)).size === PROGRESS_METRICS.length);
check(
  "core metrics have thresholds in their direction",
  PROGRESS_METRICS.filter((d) => d.source === "core").every((d) =>
    d.good != null && d.warn != null && (d.direction === "higher" ? d.good > d.warn : d.good < d.warn)
  )
);
check(
  "every default goal is a valid target",
  PROGRESS_METRICS.every((d) => d.goal == null || validTarget(d.key, d.goal))
);

// ─── 2. Per-match values and history ───────────────────────

const a = match({ day: 3, p: { team: "T" }, scoreCT: 13, scoreT: 9 });
const b = match({ day: 1, mech: null, aim: null, tactics: null, utility: null, findings: null });
const hist = buildHistory([a, b]);
check("history oldest first", hist[0].matchId === b.matchId && hist[1].matchId === a.matchId);
check("result from the player's final side (T lost 9:13)", matchResult(a).result === "L" && matchResult(a).own === 9);
check("CT won 13:9", hist[0].result === "W" && hist[0].own === 13);
check("rating and K/D", near(hist[1].values.rating.value, 1.12) && near(hist[1].values.kd.value, 1.2));
check("moving first shots = 4/20 = 20%", hist[1].values.moving_first.value === 20);
check("serious mistakes per 10 rounds = 2/22×10 ≈ 0.9", near(hist[1].values.serious.value, 0.9));
check("no stats → report metrics empty, not zero", hist[0].values.moving_first.value === null && hist[0].values.moving_first.status === "none");
check("findings never built → serious is null", hist[0].values.serious.value === null);
check("no deaths: K/D falls back to kills", buildHistory([match({ day: 5, p: { kills: 9, deaths: 0 } })])[0].values.kd.value === 9);

// ─── 3. Window aggregate ───────────────────────────────────

const small = [1, 2, 3].map((d) => match({ day: 10 + d, mech: mech({ firstShots: 3, firstShotsMoving: 1, firstShotHits: 1 }) }));
check("3 shots per match is too few on its own", buildHistory(small)[0].values.moving_first.status === "none");
const win = aggregateWindow(small);
check("summed 9 first shots are judged (3/9 = 33% → bad)", win.moving_first.value === 33 && win.moving_first.status === "bad" && win.moving_first.samples === 9);
const noisy = aggregateAim([aim({ noiseEpisodes: 2 }), aim({ noiseEpisodes: 6 })]);
check("noise is averaged per match, not summed", noisy?.noiseEpisodes === 4);
const med = aggregateAim([aim({ reactionMedianMs: 300, reactionSamples: 30 }), aim({ reactionMedianMs: 600, reactionSamples: 10 })]);
check("medians become a sample-weighted mean (375 ms)", near(med?.reactionMedianMs ?? null, 375));
check("reload counts only from matches with reload data", aggregateAim([aim({ badReloads: 4 }), aim({ reloadData: false, badReloads: 0 })])?.badReloads === 4);
const tw = aggregateTactics([tactics({ openingDuels: 2, openingWins: 2, badForces: 0 }), tactics({ openingDuels: 4, openingWins: 0, badForces: 2 })]);
check("tactics: opening duels summed (2/6), bad forces averaged per match", tw?.openingDuels === 6 && tw.openingWins === 2 && tw.badForces === 1);
const uw = aggregateUtility([utility({ flashes: 4, flashEnemySec: 8 }), utility({ flashes: 6, flashEnemySec: 2, inventoryData: false, unusedUtilityValue: 9999 })]);
check("utility: blind seconds per flash over the window, inventory only where known", uw?.flashes === 10 && uw.flashEnemySec === 10 && uw.unusedUtilityValue === 1500 && uw.inventoryData);
check("window judges utility per flash (1.0 s)", near(aggregateWindow([match({ day: 1, utility: utility({ flashes: 4, flashEnemySec: 8 }) }), match({ day: 2, utility: utility({ flashes: 6, flashEnemySec: 2 }) })]).flash_blind.value, 1));
check("strafe ms weighted by stops", near(aggregateWindow([match({ day: 1, mech: mech({ counterStrafes: 30, counterStrafeAvgMs: 100 }) }), match({ day: 2, mech: mech({ counterStrafes: 10, counterStrafeAvgMs: 200 }) })]).strafe.value, 125));
check("core window value is the mean", near(aggregateWindow([match({ day: 1, p: { adr: 70 } }), match({ day: 2, p: { adr: 90 } })]).adr.value, 80));
check("serious window: all highs over all rounds", near(aggregateWindow([match({ day: 1, rounds: 20, findings: { high: 4, medium: 0, low: 0 } }), match({ day: 2, rounds: 30, findings: { high: 1, medium: 0, low: 0 } })]).serious.value, 1));

// ─── 4. Trend ──────────────────────────────────────────────

const lowerDef = progressMetric("moving_first")!;
const higherDef = progressMetric("rating")!;
check("too few matches → no trend", computeTrend(lowerDef, [30, 20, 10]) === null && MIN_TREND_POINTS === 4);
check("lower is better: 30→10 is better", computeTrend(lowerDef, [30, 32, 28, 12, 10, 8])?.verdict === "better");
check("higher is better: rating dropping is worse", computeTrend(higherDef, [1.3, 1.25, 1.2, 0.9, 0.85, 0.8])?.verdict === "worse");
check("small change is flat", computeTrend(higherDef, [1.0, 1.0, 1.0, 1.0, 1.01, 1.02])?.verdict === "flat");
check("nulls are skipped", computeTrend(lowerDef, [30, null, 30, null, 10, 10])?.verdict === "better");
check("recent window is at most half the points", computeTrend(lowerDef, [40, 40, 10, 10])?.recent === 10);
check("delta formatting", formatDelta(lowerDef, -12) === "−12%" && formatDelta(higherDef, 0.05) === "+0.05");
check("value formatting", formatProgressValue(progressMetric("strafe")!, 118) === "118 ms" && formatProgressValue(lowerDef, null) === "–");

// ─── 5. Goals ──────────────────────────────────────────────

const goalMatches = [1, 2, 3, 4, 5, 6].map((d) =>
  match({ day: d, mech: mech({ firstShots: 20, firstShotsMoving: d <= 2 ? 10 : 2 }) })
);
const goalHist = buildHistory(goalMatches);
const g = evaluateGoal({ id: "g1", metric: "moving_first", target: 15, achievedAt: null, createdAt: "" }, goalMatches, goalHist)!;
check(`goal judged on last ${GOAL_WINDOW} matches (2+10+2+2+2 of 100 → 18%)`, g.current === 18 && !g.met);
check("goal hits count single matches on target", g.hits === 4 && g.counted === 5);
check("progress bar between 0 and 1 while open", g.progress > 0 && g.progress < 1);
const g2 = evaluateGoal({ id: "g2", metric: "moving_first", target: 20, achievedAt: null, createdAt: "" }, goalMatches, goalHist)!;
check("met goal → full bar, newly achieved", g2.met && g2.progress === 1 && g2.newlyAchieved);
const g3 = evaluateGoal({ id: "g3", metric: "moving_first", target: 20, achievedAt: "2026-09-01T00:00:00.000Z", createdAt: "" }, goalMatches, goalHist)!;
check("already recorded → not newly achieved", !g3.newlyAchieved);
check("unknown metric → no goal", evaluateGoal({ id: "x", metric: "nope", target: 1, achievedAt: null, createdAt: "" }, goalMatches, goalHist) === null);
check("meets() by direction", meets("lower", 10, 15) && !meets("lower", 16, 15) && meets("higher", 1.2, 1.1) && !meets("higher", null, 1));
check("target validation", validTarget("moving_first", 15) && !validTarget("moving_first", 140) && !validTarget("rating", -1) && !validTarget("rating", Number.NaN) && !validTarget("nope", 1));
const weak = aggregateWindow([1, 2, 3, 4, 5].map((d) => match({ day: d, p: { hltvRating: 0.8, adr: 60 }, mech: mech({ firstShotsMoving: 10 }) })));
const sugg = suggestGoals(weak, ["adr"]);
check("suggestions: worst first, skip existing goals, at most 3", sugg.length >= 2 && sugg.length <= 3 && !sugg.some((s) => s.metric === "adr") && weak[sugg[0].metric].status === "bad");
check("suggestions never offer a goal already met", sugg.every((s) => !meets(progressMetric(s.metric)!.direction, s.current, s.target)));

// ─── 6. Badges ─────────────────────────────────────────────

const R = BADGE_RULES;
const badgeMatches = [
  match({ day: 1, p: { hltvRating: 0.9 } }),
  match({ day: 2, p: { clutchWins: 2, hltvRating: 1.5 }, scoreCT: 13, scoreT: 5 }),
  match({ day: 3, mech: mech({ firstShots: 10, firstShotsMoving: 0 }), findings: { high: 0, medium: 1, low: 0 } }),
  match({ day: 4, p: { kills: 20, hsPercent: 65 } }),
];
const badges = computeBadges(badgeMatches, ["2026-09-20T00:00:00.000Z"]);
const badge = (k: string) => badges.find((x) => x.key === k)!;
check("every badge is computed", badges.length === BADGE_KEYS.length);
check("first analysis on the oldest match", badge("first_analysis").matchId === badgeMatches[0].matchId);
check("ten analyses locked at 4/10", !badge("ten_analyses").earned && near(badge("ten_analyses").progress, 0.4));
check("clutch king and MVP on day 2", badge("clutch_king").matchId === badgeMatches[1].matchId && badge("mvp").matchId === badgeMatches[1].matchId);
check("still shooter needs enough first shots (day 3)", badge("still_shooter").matchId === badgeMatches[2].matchId);
check("clean match: no high finding (day 3)", badge("clean_match").matchId === badgeMatches[2].matchId);
check("headhunter (day 4)", badge("headhunter").matchId === badgeMatches[3].matchId);
check("win streak of 3 (all CT 13:x wins in a row)", badge("win_streak").earned && badge("win_streak").matchId === badgeMatches[2].matchId && R.winStreak === 3);
check("goal reached from stored goal date", badge("goal_reached").earned && badge("goal_reached").earnedAt === "2026-09-20T00:00:00.000Z");
check("locked badges show progress below 1", badges.filter((x) => !x.earned).every((x) => x.progress >= 0 && x.progress < 1));
const improving = [
  ...[1, 2, 3, 4, 5].map((d) => match({ day: d, rounds: 20, findings: { high: 4, medium: 0, low: 0 } })),
  ...[6, 7, 8, 9, 10].map((d) => match({ day: d, rounds: 20, findings: { high: 2, medium: 0, low: 0 } })),
];
check("improver: serious mistakes halved over 5 matches", computeBadges(improving).find((x) => x.key === "improver")!.matchId === improving[9].matchId);
check("no matches → nothing earned", computeBadges([]).every((x) => !x.earned));

// ─── 7. Who the user is ────────────────────────────────────

const ap = (steamId: string, name: string, day: number) => ({ steamId, name, date: new Date(Date.UTC(2026, 8, day)).toISOString() });
const appearances = [
  ap("A", "me", 1), ap("B", "mate", 1), ap("A", "me2", 2), ap("C", "other", 2), ap("A", "me2", 3), ap("D", "faceitNick", 3),
];
check("linked Steam wins", resolvePlayer({ sessionSteamId: "C", appearances, totalMatches: 3 }).steamId === "C");
check("explicit pick wins over Steam", resolvePlayer({ requested: "B", sessionSteamId: "C", appearances, totalMatches: 3 }).how === "requested");
check("pick of a stranger is ignored", resolvePlayer({ requested: "Z", appearances, totalMatches: 3 }).steamId === "A");
check("FACEIT nickname matches an in-game name", resolvePlayer({ faceitNickname: "FaceitNick", appearances, totalMatches: 3 }).steamId === "D");
check("most frequent player (3 of 3)", resolvePlayer({ appearances, totalMatches: 3 }).how === "frequent");
check("candidates keep the latest name", resolvePlayer({ appearances, totalMatches: 3 }).candidates[0].name === "me2");
check("one match → ambiguous", resolvePlayer({ appearances: [ap("A", "x", 1), ap("B", "y", 1)], totalMatches: 1 }).steamId === null);
check("tie → ambiguous", resolvePlayer({ appearances: [ap("A", "x", 1), ap("B", "y", 1), ap("A", "x", 2), ap("B", "y", 2)], totalMatches: 2 }).how === "none");

// ─── 8. Sharing ────────────────────────────────────────────

const tok = newShareToken();
check("share token: 22 url-safe chars, random", isShareToken(tok) && tok !== newShareToken());
check("bad tokens rejected", !isShareToken("abc") && !isShareToken("../../etc/passwd/xxxxxx") && !isShareToken(null));
check(
  "replay ?round=: 1-999, default when absent, null when malformed (no NaN or Int overflow reaches Prisma)",
  parseRoundParam(null) === 1 && parseRoundParam("") === 1 && parseRoundParam("12") === 12 && parseRoundParam("999") === 999 &&
    parseRoundParam("0") === null && parseRoundParam("abc") === null && parseRoundParam("3abc") === null &&
    parseRoundParam("-1") === null && parseRoundParam("99999999999") === null && parseRoundParam("1e2") === null
);
check("slug normalised (Polish letters, spaces)", normalizeSlug("  Łukasz Żółw!! ") === "lukasz-zolw");
check("valid slugs", isValidSlug("lukasz-zolw") && isValidSlug("abc") && !isValidSlug("ab") && !isValidSlug("-abc") && !isValidSlug("a--b") && !isValidSlug("admin") && !isValidSlug("ABC"));
check("suggested slug is valid", isValidSlug(suggestSlug("Żółty Gracz", "ab12")) && isValidSlug(suggestSlug(null, "ab12")) && isValidSlug(suggestSlug("x", "ab12")));
check("paths", sharePath("t") === "/s/t" && profilePath("me") === "/u/me");
check("moment deep link", momentReplayPath("m1", { round: 4, tick: 1234.6, player: "7656" }) === "/replay/m1?round=4&tick=1235&player=7656");
const cfg = { posX: -3230, posY: 1713, scale: 5, width: 1024, height: 1024, radarImage: "" };
const w2c = makeWorldToCanvas(cfg);
const c2w = makeCanvasToWorld(cfg);
const rt = c2w(w2c(512.5, -800).x, w2c(512.5, -800).y);
const rt0 = makeCanvasToWorld(null)(makeWorldToCanvas(null)(100, 200).x, makeWorldToCanvas(null)(100, 200).y);
check("canvas ↔ world round trip (map config and fallback)", near(rt.x, 512.5) && near(rt.y, -800) && near(rt0.x, 100) && near(rt0.y, 200));

// ─── 9. Copy ───────────────────────────────────────────────

check("PL/EN label for every progress metric", PROGRESS_METRICS.every((d) => d.key in pl.progressMetrics && d.key in en.progressMetrics));
check("PL/EN title and description for every badge", BADGE_KEYS.every((k) => pl.badges[k]?.title && en.badges[k]?.desc));

// ─── View ──────────────────────────────────────────────────

const view = buildProgressView(goalMatches);
check("view: one series per metric, points per match", view.series.length === PROGRESS_METRICS.length && view.series.every((s) => s.points.length === goalMatches.length));
check("view: wins counted", view.wins === goalMatches.length && view.losses === 0);
check("view: trend for moving first shots is better", view.series.find((s) => s.key === "moving_first")?.trend?.verdict === "better");

// ─── Report ────────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
