/**
 * Regression test for the AI coach (S15).
 * Run: npm run test:coach
 *
 * Checks:
 * 1. English catalog: every finding type and category, same numbers as Polish,
 * 2. drill library: every finding type has a drill, texts in PL/EN, map names,
 * 3. learning the order of advice from ratings (smoothing, bounds, re-rank),
 * 4. weekly targets and the week's Monday (Europe/Warsaw),
 * 5. weekly plan: focuses, targets, drills, examples, schedule, determinism,
 * 6. "no invented facts": numbers in AI text must come from the facts,
 * 7. facts sent to the AI and the standard text / merge with AI text,
 * 8. PL/EN copy of the coach screens.
 *
 * No demo file, database or API key required — everything here is pure.
 */
import { CATEGORIES, FINDING_TYPES, FINDING_TYPE_KEYS, findingDef } from "@/lib/findings/catalog";
import { buildReport, type AimSummary, type MechanicsSummary, type TacticsSummary, type UtilitySummary } from "@/lib/findings/report";
import type { FindingView } from "@/lib/findings/view";
import type { MatchInput } from "@/lib/progress/metrics";
import { progressMetric } from "@/lib/progress/metrics";
import { CATEGORIES_EN, FINDING_TYPES_EN } from "@/lib/coach/catalog-en";
import { findingCopy } from "@/lib/coach/copy";
import { DRILLS, DRILL_IDS, drillText, drillsFor, workshopUrl } from "@/lib/coach/drills";
import { MAX_WEIGHT, MIN_WEIGHT, feedbackWeights, rerank, smoothedRate } from "@/lib/coach/ranking";
import {
  FOCUS_COUNT,
  PLAN_VERSION,
  buildSchedule,
  buildTrainingPlan,
  mainMap,
  pickFocuses,
  weekStartOf,
  weeklyTarget,
  type PlanFinding,
} from "@/lib/coach/plan";
import { factNumbers, isGrounded, numbersIn, ungroundedNumbers } from "@/lib/coach/grounding";
import { matchFacts, planFacts } from "@/lib/coach/facts";
import { joinList, mergeMatchText, mergePlanText, rulesMatchText, rulesPlanText } from "@/lib/coach/text";
import { groundMatchText, groundPlanText } from "@/lib/coach/ai";
import { createT } from "@/lib/i18n/translate";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const sorted = (xs: string[]) => [...xs].sort();
const sameNumbers = (a: string, b: string) => JSON.stringify(sorted(numbersIn(a))) === JSON.stringify(sorted(numbersIn(b)));

// ─── 1. English catalog ────────────────────────────────────

check("EN catalog has every finding type", FINDING_TYPE_KEYS.every((k) => k in FINDING_TYPES_EN));
check(
  "EN catalog entries are complete",
  Object.values(FINDING_TYPES_EN).every((c) => c.label && c.title && c.why && c.advice && c.drill && c.pro)
);
check("EN catalog has every category", CATEGORIES.every((c) => CATEGORIES_EN[c.key]?.label && CATEGORIES_EN[c.key]?.description));
const numberMismatch = FINDING_TYPE_KEYS.filter((k) => {
  const p = FINDING_TYPES[k];
  const e = FINDING_TYPES_EN[k];
  return !(sameNumbers(p.why, e.why) && sameNumbers(p.advice, e.advice) && sameNumbers(p.drill, e.drill) && sameNumbers(p.pro, e.pro));
});
if (numberMismatch.length > 0) console.log("  number mismatch PL/EN:", numberMismatch.join(", "));
check("EN catalog keeps every number of the Polish text", numberMismatch.length === 0);
check("findingCopy: PL from the catalog", findingCopy("moving_shot", "pl").title === FINDING_TYPES.moving_shot.title);
check("findingCopy: EN from catalog-en", findingCopy("moving_shot", "en").title === FINDING_TYPES_EN.moving_shot.title);
check("findingCopy: unknown type falls back", findingCopy("nope", "en").title === "nope");

// ─── 2. Drill library ──────────────────────────────────────

const noDrill = FINDING_TYPE_KEYS.filter((k) => drillsFor(k).length === 0);
if (noDrill.length > 0) console.log("  types without a drill:", noDrill.join(", "));
check("every finding type has at least one drill", noDrill.length === 0);
check("drill ids match their keys", DRILL_IDS.every((id) => DRILLS[id].id === id));
check(
  "drills have PL and EN text and a duration",
  DRILL_IDS.every((id) => {
    const d = DRILLS[id];
    return d.minutes > 0 && [d.pl, d.en].every((x) => x.name && x.how && x.measure);
  })
);
check("drills only name known finding types", DRILL_IDS.every((id) => DRILLS[id].types.every((t) => t in FINDING_TYPES)));
check("workshop drills name a map, app drills a screen", DRILL_IDS.every((id) => {
  const d = DRILLS[id];
  return d.where === "workshop" ? !!d.workshop : d.where === "app" ? !!d.appPath?.startsWith("/") : true;
}));
check("per-map drills carry {map}", DRILL_IDS.filter((id) => DRILLS[id].perMap).every((id) => DRILLS[id].workshop!.includes("{map}")));
const pre = drillText("prefire", "pl", "Mirage");
check("drillText fills the map", pre.name === "Prefire Mirage" && pre.workshop === "Yprac Mirage Prefire");
const preNone = drillText("prefire", "en", null);
check("drillText without a map drops the placeholder", !preNone.name.includes("{map}") && preNone.workshop === "Yprac Prefire");
check("workshop search link is encoded", workshopUrl("Aim Botz - Training") === "https://steamcommunity.com/workshop/browse/?appid=730&searchtext=Aim%20Botz%20-%20Training");
check("best drill for spray is Recoil Master", drillsFor("spray")[0].id === "recoil");

// ─── 3. Ratings → order ────────────────────────────────────

check("smoothed rate: no ratings = 50%", smoothedRate(0, 0, 1.5) === 0.5);
const none = feedbackWeights([], []);
check("no ratings: no weights", none.size === 0);
const w = feedbackWeights(
  [
    { type: "spray", helpful: 0, total: 3 },
    { type: "crosshair", helpful: 3, total: 3 },
    { type: "noise", helpful: 1, total: 1 },
  ],
  [{ type: "jump", helpful: 0, total: 40 }]
);
check("three 'not helpful' push an issue down clearly", (w.get("spray") ?? 1) < 0.8);
check("three 'helpful' push an issue up clearly", (w.get("crosshair") ?? 1) > 1.2);
check("one rating moves it only a bit", (w.get("noise") ?? 1) > 1 && (w.get("noise") ?? 1) < 1.2);
check("everyone's ratings nudge a little", (w.get("jump") ?? 1) < 1 && (w.get("jump") ?? 1) > 0.8);
const extreme = feedbackWeights([{ type: "spray", helpful: 0, total: 500 }], [{ type: "spray", helpful: 0, total: 5000 }]);
check("weights stay within bounds", (extreme.get("spray") ?? 1) >= MIN_WEIGHT && (extreme.get("spray") ?? 1) <= MAX_WEIGHT);
const ranked = rerank(
  [
    { type: "spray", score: 10 },
    { type: "crosshair", score: 8 },
    { type: "air_shot", score: 8 },
  ],
  w
);
check("re-rank: rated-up issue overtakes a rejected one", ranked[0].type === "crosshair" && ranked[2].type === "spray");
check("re-rank is stable for equal scores", rerank([{ type: "a", score: 1 }, { type: "b", score: 1 }], null).map((x) => x.type).join() === "a,b");

// ─── 4. Targets and weeks ──────────────────────────────────

const moving = progressMetric("moving_first")!; // lower, goal 15
check("target: far from the goal → halfway", weeklyTarget(moving, 41) === 28);
check("target: close to the goal → the goal", weeklyTarget(moving, 18) === 15);
check("target: goal met but still flagged → a step better", weeklyTarget(moving, 9) === 8);
check("target: no value → the goal", weeklyTarget(moving, null) === 15);
check("target: met goal at the edge still moves", weeklyTarget(progressMetric("crosshair")!, 8) === 7.2);
const firstBullet = progressMetric("first_bullet")!; // higher, goal 30
check("target: higher-is-better halfway", weeklyTarget(firstBullet, 12) === 21);
const overflick = progressMetric("overflick")!; // lower, no goal
check("target without a goal: 15% better", weeklyTarget(overflick, 40) === 34);
check("target without a goal and no value: none", weeklyTarget(overflick, null) === null);
const jump = progressMetric("jump")!; // lower, 1 decimal, no goal
check("target is always at least one unit better", weeklyTarget(jump, 0.1) === 0);
check("percent target never above 100", weeklyTarget({ direction: "higher", decimals: 0, unit: "%" }, 95) === 100);
check("week of a Wednesday starts Monday", weekStartOf(new Date("2026-10-14T12:00:00Z")) === "2026-10-12");
check("Monday is its own week", weekStartOf(new Date("2026-10-12T08:00:00Z")) === "2026-10-12");
check("Sunday belongs to the week before", weekStartOf(new Date("2026-10-18T12:00:00Z")) === "2026-10-12");
check("Sunday 23:30 UTC is Monday in Warsaw", weekStartOf(new Date("2026-10-18T23:30:00Z")) === "2026-10-19");
check("week across a month boundary", weekStartOf(new Date("2026-11-01T10:00:00Z")) === "2026-10-26");

// ─── 5. Weekly plan ────────────────────────────────────────

const mech = (over: Partial<MechanicsSummary> = {}): MechanicsSummary => ({
  firstShots: 20, firstShotsMoving: 9, firstShotHits: 4, hits: 30, headHits: 12,
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
  openingDuels: 6, openingWins: 3, anchorRounds: 10, sameSpotRounds: 4, forceRounds: 2, badForces: 0, ...over,
});
const utility = (over: Partial<UtilitySummary> = {}): UtilitySummary => ({
  smokes: 8, smokesVoid: 1, smokesEarly: 0, flashes: 10, flashesBlinding: 6, flashesFollowed: 4,
  flashEnemySec: 13, flashTeamSec: 2, teamFlashes: 1, hes: 4, heDamage: 80, molotovs: 3, molotovDamage: 40,
  nadeTeamDamage: 0, nadesNoEffect: 1, deaths: 15, deathsWithUtility: 2, unusedUtilityValue: 900, inventoryData: true, ...over,
});

let seq = 0;
const match = (day: number, map = "de_mirage", over: Partial<MatchInput> = {}): MatchInput => {
  seq++;
  return {
    matchId: `m${String(seq).padStart(3, "0")}`,
    date: new Date(Date.UTC(2026, 9, day)).toISOString(),
    map,
    scoreCT: 13,
    scoreT: 9,
    rounds: 22,
    player: { name: "gracz", team: "CT", kills: 18, deaths: 15, adr: 82, hltvRating: 1.12, hsPercent: 45, firstKills: 2, clutchWins: 0 },
    mech: mech(),
    aim: aim(),
    tactics: tactics(),
    utility: utility(),
    findings: { high: 2, medium: 3, low: 0 },
    ...over,
  };
};

const matches = [match(1), match(2, "de_inferno"), match(3), match(4), match(5)];
let fseq = 0;
const finding = (matchId: string, type: string, severity: string, roundNumber: number, costly = true): PlanFinding => ({
  id: `f${++fseq}`, matchId, steamId: "S1", type, severity, costly, roundNumber, tick: roundNumber * 1000,
});
const findings: PlanFinding[] = [];
for (const m of matches) {
  findings.push(finding(m.matchId, "moving_shot", "high", 3), finding(m.matchId, "moving_shot", "high", 7));
  findings.push(finding(m.matchId, "moving_shot", "medium", 11, false));
  findings.push(finding(m.matchId, "untraded_death", "medium", 5));
}
findings.push(finding(matches[4].matchId, "smoke_early", "high", 9));
findings.push(finding("other-match", "spray", "high", 1));

const plan = buildTrainingPlan({ weekStart: "2026-10-12", matches, findings });
check("plan: version and week", plan.version === PLAN_VERSION && plan.weekStart === "2026-10-12");
check("plan: counts the window", plan.matches === 5 && plan.firstDate! < plan.lastDate!);
check("plan: player name from the latest match", plan.player === "gracz");
check("plan: main map is the most played one", plan.map === "de_mirage" && mainMap([{ map: "a" }, { map: "b" }]) === "b");
check("plan: at most FOCUS_COUNT focuses", plan.focuses.length > 0 && plan.focuses.length <= FOCUS_COUNT);
check("plan: worst habit first", plan.focuses[0].type === "moving_shot");
check("plan: findings of other matches are ignored", plan.focuses.every((f) => f.type !== "spray"));
const mv = plan.focuses[0];
check("plan: metric target from the window (45% moving → 30%)", mv.metric?.metric === "moving_first" && mv.metric.current === 45 && mv.metric.target === 30 && mv.metric.goal === 15);
check("plan: moments per match and a lower target", mv.moments.total === 15 && mv.moments.perMatch === 3 && mv.moments.target === 1.8);
check("plan: focus drills come from the library", plan.focuses.every((f) => f.drills.length > 0 && f.drills.every((d) => (DRILLS[d].types as string[]).includes(f.type))));
check("plan: examples are the worst moments, newest match first", mv.examples.length === 2 && mv.examples.every((e) => e.matchId === matches[4].matchId && e.roundNumber !== 11));
check("plan: at most two focuses per category", (() => {
  const c = new Map<string, number>();
  for (const f of plan.focuses) c.set(f.category, (c.get(f.category) ?? 0) + 1);
  return [...c.values()].every((n) => n <= 2);
})());
check("plan: 7 days, Sunday is review", plan.days.length === 7 && plan.days[6].items.some((i) => i.kind === "review"));
check("plan: three match days", plan.days.filter((d) => d.items.some((i) => i.kind === "match")).length === 3);
check("plan: every day starts with a warm-up", plan.days.every((d) => d.items[0].kind === "drill" && d.items[0].focus === null));
check("plan: the warm-up isn't repeated as the focus drill", plan.days.every((d) => d.items.filter((i) => i.kind === "drill" && i.drill === "aim_botz_strafe").length === 1));
check("plan: shooting focus → counter-strafe warm-up", plan.days[0].items[0].kind === "drill" && plan.days[0].items[0].drill === "aim_botz_strafe");
check("plan: day minutes add up", plan.days.every((d) => d.minutes === d.items.reduce((s, i) => s + i.minutes, 0)));
check("plan: first focus gets the most days", (() => {
  const n = (type: string) => plan.days.filter((d) => d.items.some((i) => i.kind === "drill" && i.focus === type)).length;
  return plan.focuses.every((f) => n(plan.focuses[0].type) >= n(f.type));
})());
check("plan: deterministic", JSON.stringify(plan) === JSON.stringify(buildTrainingPlan({ weekStart: "2026-10-12", matches: [...matches].reverse(), findings })));
const rated = buildTrainingPlan({
  weekStart: "2026-10-12",
  matches,
  findings,
  weights: feedbackWeights([{ type: "moving_shot", helpful: 0, total: 6 }], []),
});
check("plan: 'not helpful' ratings move an issue down", rated.focuses[0].type !== "moving_shot");
const clean = buildTrainingPlan({
  weekStart: "2026-10-12",
  matches: [match(6, "de_nuke", { mech: null, aim: null, tactics: null, utility: null })],
  findings: [],
});
check("plan: nothing to fix → no focuses, still a week", clean.focuses.length === 0 && clean.days.length === 7 && clean.days[0].items.some((i) => i.kind === "drill" && i.drill === "dm_discipline"));
const emptySchedule = buildSchedule([]);
check("schedule without focuses keeps match days free", emptySchedule.filter((d) => d.items.some((i) => i.kind === "match" && i.focus === null)).length === 3);
check(
  "pickFocuses caps a category",
  pickFocuses(
    [
      { type: "a", score: 9, def: { category: "shooting" } },
      { type: "b", score: 8, def: { category: "shooting" } },
      { type: "c", score: 7, def: { category: "shooting" } },
      { type: "d", score: 1, def: { category: "utility" } },
    ],
    null
  ).map((x) => x.type).join() === "a,b,d"
);

// ─── 6. No invented facts ──────────────────────────────────

check("numbersIn normalises commas and zeros", JSON.stringify(numbersIn("0,6 s i 07 rund, 1.50")) === JSON.stringify(["0.6", "7", "1.5"]));
check("weapon names don't count as numbers", numbersIn("AK-47 i M4A1-S w CS2, 1v3").length === 0);
const allowed = factNumbers({ a: 41.6, b: "R12 · 180 u/s (próg 73)", c: [{ d: "1:23" }] });
check("fact numbers include values inside strings", ["180", "73", "12", "23"].every((n) => allowed.has(n)));
check("fact numbers include rounded values", allowed.has("42") && allowed.has("41.6"));
check("small counts are always allowed", allowed.has("3") && allowed.has("10"));
check("ungrounded number is caught", JSON.stringify(ungroundedNumbers("W rundzie 14 strzelałeś przy 180 u/s", allowed)) === JSON.stringify(["14"]));
check("grounded text passes", isGrounded(["Przy 180 u/s w rundzie 12 (próg 73) nie trafisz."], allowed));

// ─── 7. Facts, standard text and AI merge ──────────────────

const views: FindingView[] = findings
  .filter((f) => f.matchId === matches[0].matchId)
  .map((f) => ({
    id: f.id, type: f.type, label: findingDef(f.type).label, category: findingDef(f.type).category,
    severity: f.severity as FindingView["severity"], steamId: "S1", targetSteamId: null,
    roundNumber: f.roundNumber, tick: f.tick, roundTime: 83, costly: f.costly,
    values: [{ label: "Prędkość", value: 180, unit: "u/s", ref: 73 }],
    detail: `Strzał przy 180 u/s w rundzie ${f.roundNumber}.`, advice: "",
  }));
const report = buildReport(views, []);
const mf = matchFacts({
  locale: "en", map: "Mirage", playerName: "gracz", score: { own: 13, opp: 9 }, rounds: 22,
  issues: report.issues.slice(0, 2), strengths: [],
});
check("match facts: language and score", mf.language === "English" && mf.match.score === "13:9" && mf.match.result === "win");
check("match facts: only the given issues, English copy", mf.issues.length === 2 && mf.issues[0].title === FINDING_TYPES_EN[mf.issues[0].type as "moving_shot"].title);
check("match facts: at most 3 examples per issue with numbers", mf.issues.every((i) => i.examples.length <= 3 && i.examples.every((e) => e.numbers.length > 0 && e.time_in_round === "1:23")));
const mfNums = factNumbers(mf);
check("match facts carry the finding numbers", mfNums.has("180") && mfNums.has("73") && mfNums.has("13"));

const goodAi = groundMatchText(
  {
    summary: "Most rounds go when you shoot at 180 u/s.",
    items: [
      { type: mf.issues[0].type, headline: "Stop before you shoot", explanation: "In round 3 and 7 you fired at 180 u/s, the limit is 73.", action: "Counter-strafe first." },
      { type: mf.issues[1].type, headline: "Trade", explanation: "In round 19 nobody traded you, 4 times.", action: "Stay close." },
      { type: "spray", headline: "x", explanation: "y", action: "z" },
    ],
  },
  mf
);
check("AI text: grounded item kept", goodAi.text.items?.length === 1 && goodAi.text.items[0].type === mf.issues[0].type);
check("AI text: item with an invented round dropped", goodAi.rejected === 1);
check("AI text: grounded summary kept", goodAi.text.summary === "Most rounds go when you shoot at 180 u/s.");
const badSummary = groundMatchText({ summary: "You lost 7 of 16 duels.", items: [] }, mf);
check("AI text: invented summary dropped", badSummary.text.summary === undefined && badSummary.rejected === 1);
const dup = groundMatchText(
  { summary: "", items: [mf.issues[0], mf.issues[0]].map((i) => ({ type: i.type, headline: "A", explanation: "B", action: "C" })) },
  mf
);
check("AI text: duplicate types and empty summary handled", dup.text.items?.length === 1 && dup.text.summary === undefined);

const tEn = createT("en");
const tPl = createT("pl");
const rulesEn = rulesMatchText(mf.issues.map((i) => i.type), "en", tEn);
check("standard match text: one item per issue in English", rulesEn.items.length === 2 && rulesEn.items[0].action === FINDING_TYPES_EN[rulesEn.items[0].type as "moving_shot"].advice);
check("standard match text: nothing to fix", rulesMatchText([], "pl", tPl).summary === pl.coach.matchNothing);
const merged = mergeMatchText(rulesEn, goodAi.text);
check("merge: AI item replaces standard, missing one keeps standard", merged.items[0].headline === "Stop before you shoot" && merged.items[1].headline === rulesEn.items[1].headline);
check("merge: AI summary used", merged.summary === goodAi.text.summary);
check("merge: no AI → standard", mergeMatchText(rulesEn, null) === rulesEn);

const pf = planFacts(plan, { locale: "pl", playerName: "gracz", mapName: "Mirage" });
check("plan facts: focuses with targets and drills", pf.focuses.length === plan.focuses.length && pf.focuses[0].metric?.week_target === "30%" && pf.focuses[0].drills.length > 0);
const pfNums = factNumbers(pf);
check("plan facts carry the targets", pfNums.has("30") && pfNums.has("45") && pfNums.has("1.8"));
const planAi = groundPlanText(
  {
    intro: "Ten tydzień: strzały w ruchu z 45% do 30%.",
    focus: [
      { type: plan.focuses[0].type, why: "Teraz 45%, cel 30%.", action: "Counter-strafe w każdym pojedynku." },
      { type: plan.focuses[1]?.type ?? "x", why: "Masz 99% złych trade'ów.", action: "Graj bliżej." },
    ],
  },
  pf
);
check("plan AI text: grounded focus kept, invented one dropped", planAi.text.focus?.length === 1 && planAi.rejected === 1);
const rulesPl = rulesPlanText(plan, "pl", tPl);
check("standard plan text: intro lists the focuses", rulesPl.intro.includes(findingCopy(plan.focuses[0].type, "pl").title.toLowerCase()));
check("standard plan text: nothing to fix", rulesPlanText(clean, "en", tEn).intro === en.coach.rulesIntroNone);
const mergedPlan = mergePlanText(rulesPl, planAi.text);
check("plan merge: AI intro, standard for dropped focus", mergedPlan.intro === planAi.text.intro && (plan.focuses.length < 2 || mergedPlan.focus[1].why === rulesPl.focus[1].why));
check("joinList PL/EN", joinList(["a", "b", "c"], "pl") === "a, b i c" && joinList(["a", "b"], "en") === "a and b" && joinList(["a"], "en") === "a");

// ─── 8. PL/EN copy ─────────────────────────────────────────

check("coach copy has the same keys in PL and EN", JSON.stringify(Object.keys(pl.coach).sort()) === JSON.stringify(Object.keys(en.coach).sort()));
check("coach copy: seven day names", [0, 1, 2, 3, 4, 5, 6].every((d) => `day${d}` in pl.coach && `day${d}` in en.coach));
check("nav has the coach", pl.nav.coach === "Trener" && en.nav.coach === "Coach");
check("placeholders match between PL and EN", (Object.keys(pl.coach) as Array<keyof typeof pl.coach>).every((k) => {
  const vars = (s: string) => sorted(s.match(/\{\w+\}/g) ?? []).join();
  return vars(pl.coach[k]) === vars(en.coach[k]);
}));

// ─── Report ────────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
