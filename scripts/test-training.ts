/**
 * Regression test for the training generator and the lineup trainer (S22).
 * Run: npm run test:training
 *
 * Checks:
 * 1. .cfg text: ASCII only, no quotes/semicolons, no key binds, aliases prefixed,
 *    the S22 grenade practice cvars, line length within the console limit,
 * 2. the throw behind a finding and the better lineups for it (target, same spot,
 *    side, range, no repeat of a void throw),
 * 3. the day's lineups (mastered skipped, grenade types, side) and mastery %,
 * 4. the daily routine from the weekly plan (Workshop maps, minutes, numeric
 *    targets, lineup days, PL/EN), the weekday in Europe/Warsaw,
 * 5. the "smoke too early" card leads to the trainer (done-criterion of S22).
 *
 * No demo file, database or network required — everything here is pure.
 */
import { buildLineups, setposCommand, type Lineup, type LineupThrow } from "@/lib/analysis/lineups";
import type { UtilityThrow } from "@/lib/analysis/utility";
import { FINDING_TYPES } from "@/lib/findings/catalog";
import { drillsFor, DRILLS } from "@/lib/coach/drills";
import { buildSchedule, type PlanFocus, type TrainingPlanContent } from "@/lib/coach/plan";
import { createT } from "@/lib/i18n/translate";
import {
  MAX_CFG_LINEUPS,
  PRACTICE_SETTINGS,
  cfgFileName,
  cfgText,
  execName,
  lineupPracticeCfg,
  routineCfg,
} from "@/lib/training/cfg";
import {
  LINEUP_FINDING_TYPES,
  LINEUP_KEY_RE,
  MAX_PRACTICE,
  PRACTICE_RANGE,
  hasLineupPractice,
  masteryPercent,
  practiceLineups,
  routineLineups,
  throwForFinding,
} from "@/lib/training/lineup-trainer";
import { buildRoutine, planDayOf } from "@/lib/training/routine";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ─── Fixtures ───────────────────────────────────────────

const lineup = (o: Partial<Lineup> & Pick<Lineup, "key">): Lineup => ({
  type: "SMOKE",
  technique: "jump",
  side: "T",
  x: 1000,
  y: 0,
  z: 0,
  pitch: -10,
  yaw: 45,
  land: { x: 2000, y: 0, z: 0 },
  samples: 5,
  matches: 3,
  players: 2,
  landPlace: "Okno",
  throwPlace: "Spawn T",
  ...o,
});

const throwAt = (o: Partial<UtilityThrow> = {}): UtilityThrow => ({
  type: "SMOKE",
  roundNumber: 4,
  side: "T",
  throwTick: 1000,
  detTick: 1200,
  roundTime: 30,
  x: 1000,
  y: 0,
  z: 0,
  pitch: -10,
  yaw: 45,
  technique: "jump",
  land: { x: 2000, y: 0, z: 0 },
  ...o,
});

const WINDOW = lineup({ key: "SMOKE:jump:63:0:31:0" }); // exactly the fixture throw
const NEAR = lineup({ key: "SMOKE:stand:70:10:34:3", technique: "stand", x: 1100, y: 160, land: { x: 2180, y: 200, z: 0 }, samples: 9 });
const FAR = lineup({ key: "SMOKE:stand:10:10:60:60", technique: "stand", x: 200, y: 200, land: { x: 3900, y: 3900, z: 0 } });
const CT_ONLY = lineup({ key: "SMOKE:stand:80:0:33:-2", technique: "stand", side: "CT", x: 1300, land: { x: 2100, y: -100, z: 0 } });
const MOLLY = lineup({ key: "MOLOTOV:run:60:0:32:0", type: "MOLOTOV", technique: "run", land: { x: 2050, y: 0, z: 0 } });
const UPPER = lineup({ key: "SMOKE:stand:65:0:31:1", technique: "stand", x: 1050, land: { x: 2010, y: 30, z: 400 } });
const BASE = [WINDOW, NEAR, FAR, CT_ONLY, MOLLY, UPPER];

// ─── 1. Config files ────────────────────────────────────

check("cfgText: diacritics folded", cfgText("Ćwicz smoke'a na Oknie – żółty łuk") === "Cwicz smoke'a na Oknie - zolty luk");
check("cfgText: quotes and semicolons can't break the line", !/[";]/.test(cfgText('a "b"; c;d')) && cfgText("a\nb") === "a b");
check("cfgText: output is printable ASCII", /^[\x20-\x7e]*$/.test(cfgText("≤ 0,4 „Smoke za wcześnie” · 1:45 → cel 😀")));
check("cfgFileName: map suffix without de_", cfgFileName("lineups", "de_mirage") === "cs2a_lineups_mirage.cfg");
check("cfgFileName: routine", cfgFileName("routine") === "cs2a_routine.cfg" && execName("cs2a_routine.cfg") === "cs2a_routine");
check(
  "practice settings: the S22 cvars are there",
  ["sv_cheats 1", "sv_infinite_ammo 1", "sv_grenade_trajectory_prac_pipreview 1"].every((c) => (PRACTICE_SETTINGS as readonly string[]).includes(c))
);
check("practice settings: sv_cheats comes first", PRACTICE_SETTINGS[0] === "sv_cheats 1");

/** Every line of a .cfg is safe: ASCII, short, balanced quotes, no bind, aliases prefixed. */
function cfgSafe(cfg: string): string[] {
  const problems: string[] = [];
  for (const line of cfg.split("\n")) {
    if (!/^[\x20-\x7e]*$/.test(line)) problems.push(`non-ASCII: ${line}`);
    if (line.length > 1000) problems.push(`too long: ${line.slice(0, 40)}`);
    if ((line.match(/"/g) ?? []).length % 2 !== 0) problems.push(`quotes: ${line}`);
    if (/^\s*bind\b/i.test(line)) problems.push(`bind: ${line}`);
    const alias = line.match(/^alias (\S+)/);
    if (alias && !alias[1].startsWith("cs2a_")) problems.push(`alias: ${alias[1]}`);
    const echo = line.match(/^echo "(.*)"$/);
    if (line.startsWith("echo") && (!echo || /["]/.test(echo[1]))) problems.push(`echo: ${line}`);
  }
  return problems;
}

const many = Array.from({ length: 15 }, (_, i) => lineup({ key: `SMOKE:jump:${i}:0:1:0`, landPlace: i === 0 ? 'Okno "A"; quit' : `Miejsce ${i}` }));
const lcfg = lineupPracticeCfg({ map: "de_mirage", mapName: "Mirage", lineups: many, locale: "pl", date: "12 paź 2026" });
check("lineup cfg: every line safe", cfgSafe(lcfg).length === 0);
check("lineup cfg: practice settings run on exec", PRACTICE_SETTINGS.every((c) => lcfg.split("\n").includes(c)));
check(`lineup cfg: at most ${MAX_CFG_LINEUPS} lineup aliases`, (lcfg.match(/^alias cs2a_\d+ /gm) ?? []).length === MAX_CFG_LINEUPS);
check("lineup cfg: alias holds the setpos/setang", lcfg.includes(`alias cs2a_1 "${setposCommand(many[0])}"`));
check("lineup cfg: a callout can't inject a command", !lcfg.includes("; quit") && !lcfg.includes('"A"'));
check("lineup cfg: says how to exec it", lcfg.includes("exec cs2a_lineups_mirage") && lcfg.includes("map de_mirage"));
check("lineup cfg: rethrow shortcut", lcfg.includes('alias cs2a_rethrow "sv_rethrow_last_grenade"'));
const empty = lineupPracticeCfg({ map: "de_nuke", mapName: "Nuke", lineups: [], locale: "en", date: "12 Oct 2026" });
check("lineup cfg: empty base still a valid file", cfgSafe(empty).length === 0 && empty.includes("No lineups yet") && !/alias cs2a_\d/.test(empty));

// ─── 2. Better lineups for a finding ────────────────────

const throws = [throwAt(), throwAt({ type: "MOLOTOV", detTick: 1210 }), throwAt({ roundNumber: 5 })];
check("throwForFinding: same round, detonation at the tick", throwForFinding(throws, { type: "smoke_early", roundNumber: 4, tick: 1200 }) === throws[0]);
check("throwForFinding: molotov finding takes the molotov", throwForFinding(throws, { type: "molotov_no_effect", roundNumber: 4, tick: 1210 }) === throws[1]);
check("throwForFinding: a few ticks of slack", throwForFinding(throws, { type: "smoke_void", roundNumber: 4, tick: 1205 }) === throws[0]);
check("throwForFinding: other round → none", throwForFinding(throws, { type: "smoke_early", roundNumber: 6, tick: 1200 }) === null);
check("throwForFinding: non-grenade finding → none", throwForFinding(throws, { type: "spray", roundNumber: 4, tick: 1200 }) === null);
check("throwForFinding: far tick → none", throwForFinding(throws, { type: "smoke_early", roundNumber: 4, tick: 1400 }) === null);

const early = practiceLineups(throwAt(), "smoke_early", BASE);
check("smoke too early: the same spot is first", early[0]?.lineup.key === WINDOW.key && early[0].reason === "same_spot");
check("smoke too early: a nearby lineup follows", early.some((p) => p.lineup.key === NEAR.key && p.reason === "nearby"));
check("smoke too early: only smokes", early.every((p) => p.lineup.type === "SMOKE"));
check("practice: CT-only lineup not suggested to a T", early.every((p) => p.lineup.side !== "CT"));
check("practice: CT-only lineup suggested to a CT", practiceLineups(throwAt({ side: "CT" }), "smoke_early", BASE).some((p) => p.lineup.key === CT_ONLY.key));
check(`practice: nothing further than ${PRACTICE_RANGE} u`, early.every((p) => p.offBy <= PRACTICE_RANGE) && early.every((p) => p.lineup.key !== FAR.key));
check("practice: other floor (z) skipped", early.every((p) => p.lineup.key !== UPPER.key));
check(`practice: at most ${MAX_PRACTICE}`, practiceLineups(throwAt(), "smoke_early", [...BASE, ...many.map((l) => ({ ...l, land: { x: 2050, y: 10, z: 0 } }))]).length === MAX_PRACTICE);

const voidPicks = practiceLineups(throwAt(), "smoke_void", BASE);
check("void smoke: the same throw isn't suggested back", voidPicks.every((p) => p.lineup.key !== WINDOW.key));
check("void smoke: another lineup for the area", voidPicks.some((p) => p.lineup.key === NEAR.key));

const missed = throwAt({ x: 900, y: -40, yaw: 49, land: { x: 2190, y: 120, z: 0 } }); // landed ~225 u off the Window lineup
const miss = practiceLineups(missed, "lineup_miss", [WINDOW, FAR, CT_ONLY, MOLLY]);
check("lineup off target: the target lineup first", miss[0]?.reason === "target" && miss[0].lineup.key === WINDOW.key && miss[0].offBy >= 110);
check("molotov without effect: molotov lineups", practiceLineups(throwAt({ type: "MOLOTOV", land: { x: 2400, y: 0, z: 0 } }), "molotov_no_effect", BASE).every((p) => p.lineup.type === "MOLOTOV"));

// ─── 3. The day's lineups and mastery ───────────────────

const mastered = new Set([NEAR.key]);
const day = routineLineups(BASE, mastered, { types: ["SMOKE", "MOLOTOV"] });
check("day lineups: mastered skipped", day.every((l) => l.key !== NEAR.key));
check("day lineups: smokes before molotovs", day.length === MAX_PRACTICE && day.every((l) => l.type === "SMOKE"));
check("day lineups: no grenade types → none", routineLineups(BASE, mastered, { types: [] }).length === 0);
check("day lineups: side filter", routineLineups(BASE, new Set(), { types: ["SMOKE"], side: "T", max: 10 }).every((l) => l.side !== "CT"));
check("mastery %: 1 of 6", masteryPercent(BASE, mastered) === 17 && masteryPercent([], mastered) === 0);

// Keys built by the lineup base pass the API's key check.
const learned: LineupThrow[] = [1, 2, 3].map((i) => ({ ...throwAt({ x: 1000 + i, y: -3000 - i, land: { x: -2000, y: 500, z: 0 } }), matchId: `m${i}`, steamId: "s" }));
const built = buildLineups(learned);
check("lineup keys match the mastery API's pattern", built.length === 1 && LINEUP_KEY_RE.test(built[0].key) && BASE.every((l) => LINEUP_KEY_RE.test(l.key)));
check("mastery API rejects junk keys", !LINEUP_KEY_RE.test("SMOKE:jump:1:2:3") && !LINEUP_KEY_RE.test("x; drop table"));

// ─── 4. Daily routine ───────────────────────────────────

const focus = (type: string, category: PlanFocus["category"]): PlanFocus => ({
  type,
  category,
  score: 1,
  severity: "high",
  metric:
    type === "moving_shot"
      ? { metric: "moving_first", unit: "%", direction: "lower", decimals: 0, current: 30, target: 20, goal: 15, status: "bad", samples: 50 }
      : null,
  moments: { total: 12, high: 4, matches: 5, perMatch: 2.4, target: 1.4 },
  drills: drillsFor(type).slice(0, 2).map((d) => d.id),
  examples: [],
});
const focuses = [focus("moving_shot", "shooting"), focus("smoke_early", "utility"), focus("untraded_death", "teamplay")];
const plan: Pick<TrainingPlanContent, "days" | "focuses"> = { focuses, days: buildSchedule(focuses) };
const tPl = createT("pl");
const tEn = createT("en");

const mon = buildRoutine(plan, 0, "pl", "Mirage", tPl);
check("routine: one item per plan item", mon.items.length === plan.days[0].items.length);
check("routine: minutes add up to the plan day", mon.minutes === plan.days[0].minutes);
check("routine: starts with the warm-up", mon.items[0].warmup && mon.items[0].kind === "drill");
check(
  "routine: Workshop drills name the map and link the Workshop search",
  mon.items.filter((i) => i.where === "workshop").every((i) => i.workshop && i.workshopUrl?.startsWith("https://steamcommunity.com/workshop/browse/?appid=730&searchtext="))
);
check("routine: every item has a target", [0, 1, 2, 3, 4, 5, 6].every((d) => buildRoutine(plan, d, "pl", "Mirage", tPl).items.every((i) => i.target.length > 0)));
check("routine: drill target is a number", mon.items.filter((i) => i.kind === "drill").every((i) => /\d/.test(i.target)));
check("routine: {map} filled in", [0, 1, 2, 3, 4, 5].every((d) => buildRoutine(plan, d, "pl", "Mirage", tPl).items.every((i) => !i.name.includes("{map}") && !(i.workshop ?? "").includes("{map}"))));

const tue = buildRoutine(plan, 1, "pl", "Mirage", tPl);
const match = tue.items.find((i) => i.kind === "match");
check("routine: match day has a numeric focus target", !!match && match.target.includes("1.4") && match.target.includes("2.4"));
check("routine: match target includes the metric target", (() => {
  const d = [0, 1, 2, 3, 4, 5].map((n) => buildRoutine(plan, n, "pl", "Mirage", tPl)).find((r) => r.items.some((i) => i.kind === "match" && i.focus === "moving_shot"));
  return !!d && d.items.some((i) => i.kind === "match" && i.target.includes("≤ 20%"));
})());
check("routine: a utility day practises lineups", tue.lineupTypes.includes("SMOKE"));
const shootingOnly = buildRoutine({ focuses: [focuses[0]], days: buildSchedule([focuses[0]]) }, 0, "pl", "Mirage", tPl);
check("routine: a shooting-only day has no lineups", shootingOnly.lineupTypes.length === 0);
const sun = buildRoutine(plan, 6, "pl", "Mirage", tPl);
check("routine: Sunday is review", sun.items.some((i) => i.kind === "review" && i.appPath === "/progress"));
const en = buildRoutine(plan, 1, "en", "Mirage", tEn);
check("routine: English text", en.items[0].how !== tue.items[0].how && en.items.some((i) => i.kind === "match" && i.target.includes("per match")));
check("routine: unknown day → empty", buildRoutine(plan, 9, "pl", null, tPl).items.length === 0);

const rcfg = routineCfg({ routine: tue, dayName: "Wtorek", date: "13 paź 2026", mapName: "Mirage", lineups: day, locale: "pl" });
check("routine cfg: every line safe", cfgSafe(rcfg).length === 0);
check("routine cfg: prints every item with its minutes", tue.items.every((i, n) => rcfg.includes(`echo "${n + 1}. `) && rcfg.includes(`${i.minutes} min`)));
check("routine cfg: day's lineups as aliases", day.every((l, n) => rcfg.includes(`alias cs2a_${n + 1} "${setposCommand(l)}"`)));
check("routine cfg: practice server only on demand (alias, not run)", !rcfg.split("\n").includes("sv_cheats 1") && rcfg.includes('alias cs2a_practice "sv_cheats 1;'));
check("routine cfg: velocity shortcut on a counter-strafe day", rcfg.includes("cs2a_speed") === tue.items.some((i) => i.drill === "aim_botz_strafe"));
check("routine cfg: Workshop map named", tue.items.filter((i) => i.workshop).every((i) => rcfg.includes(cfgText(i.workshop!))));

check("planDayOf: Monday 12 Oct 2026", planDayOf(new Date("2026-10-12T10:00:00Z")) === 0);
check("planDayOf: Sunday 23:30 UTC is Monday in Warsaw", planDayOf(new Date("2026-10-11T22:30:00Z")) === 0);
check("planDayOf: Sunday", planDayOf(new Date("2026-10-18T12:00:00Z")) === 6);

// ─── 5. Finding cards → trainer ─────────────────────────

check("smoke too early links to the lineup trainer", hasLineupPractice("smoke_early"));
check("lineup finding types exist in the catalog", LINEUP_FINDING_TYPES.every((t) => t in FINDING_TYPES));
check("non-grenade findings have no trainer link", !hasLineupPractice("spray") && !hasLineupPractice("untraded_death"));
check("smoke too early is trained by the lineup drill", drillsFor("smoke_early").some((d) => d.id === "lineups") && DRILLS.lineups.appPath === "/lineups");

// ─────────────────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed > 0) process.exit(1);
