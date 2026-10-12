/**
 * Regression test for Findings and the "what to improve" report (S10).
 * Run: npm run test:findings
 *
 * Checks:
 * 1. the catalog: every type has a category, advice, a drill, a pro reference and a clip,
 * 2. mechanics moments → moving_shot / late_strafe with the right severity,
 * 3. aim moments → one finding type each, enemy carried as the clip target,
 *    jump-scouting with the SSG 08 not reported,
 * 4. every finding has a round, a tick and one piece of advice,
 * 5. metrics: too few samples are not judged,
 * 6. the report: ranking, top 3, metric-only issues, strengths, categories, totals.
 *
 * No demo file or database required — everything here is pure.
 */
import {
  CATEGORIES,
  FINDING_TYPES,
  FINDING_TYPE_KEYS,
  findingDef,
} from "@/lib/findings/catalog";
import { detectFindings, fromAim, fromMechanics } from "@/lib/findings/detect";
import { buildReport, formatMetric, playerMetrics, type AimSummary, type MechanicsSummary } from "@/lib/findings/report";
import type { MovementMoment } from "@/lib/analysis/movement";
import type { AimMoment } from "@/lib/analysis/aim";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

const P = "76561190000000001";
const E = "76561190000000002";

// ─── 1. Catalog ──────────────────────────────────────────

const categoryKeys = new Set(CATEGORIES.map((c) => c.key));
check(
  "every type: known category, advice, drill, pro, why, clip",
  FINDING_TYPE_KEYS.every((t) => {
    const d = FINDING_TYPES[t];
    return (
      categoryKeys.has(d.category) && d.advice.length > 20 && d.drill.length > 10 &&
      d.pro.startsWith("pro:") && d.why.length > 20 && d.clip.before > 0 && d.clip.after > 0 && d.weight > 0
    );
  })
);
check("S12 categories have types and are no longer 'planned'", ["teamplay", "economy", "positioning"].every(
  (k) => !CATEGORIES.find((c) => c.key === k)?.plannedIn && FINDING_TYPE_KEYS.some((t) => FINDING_TYPES[t].category === k)
));
check("unknown type gets a fallback definition", findingDef("smoke_too_early").label === "smoke_too_early");

// ─── 2. Mechanics ────────────────────────────────────────

const mv = (over: Partial<MovementMoment>): MovementMoment => ({
  roundNumber: 3, tick: 5000, roundTime: 40.5, weapon: "ak47", speed: 180, threshold: 73,
  airborne: false, hit: false, strafeMs: null, enemy: E, ...over,
});
const mech = fromMechanics([
  {
    steamId: P,
    moments: [
      mv({}), // running miss → high
      mv({ speed: 100, tick: 5100 }), // a bit fast, miss → medium
      mv({ hit: true, tick: 5200 }), // hit → low
      mv({ strafeMs: 45, speed: 110, tick: 5300 }), // braking, miss → late_strafe medium
      mv({ strafeMs: 0, tick: 5400 }), // never braked → moving_shot
      mv({ airborne: true, speed: 60, tick: 5500 }), // jump shot
    ],
  },
]);
check("6 mechanics findings", mech.length === 6);
check("running miss = high moving_shot", mech[0].type === "moving_shot" && mech[0].severity === "high" && mech[0].costly);
check("slightly fast miss = medium", mech[1].severity === "medium");
check("moving hit = low, not costly", mech[2].severity === "low" && !mech[2].costly);
check(
  "braking shot = late_strafe with braking time",
  mech[3].type === "late_strafe" && mech[3].values.some((v) => v.label === "Hamowanie" && v.value === 45) && mech[3].severity === "medium"
);
check("strafeMs 0 = moving_shot, not late_strafe", mech[4].type === "moving_shot");
check("airborne advice is about landing", mech[5].type === "moving_shot" && /wyląduj/.test(mech[5].advice));
check("movement enemy becomes the clip target", mech[0].targetSteamId === E);
check("speed value carries the threshold", mech[0].values[0].value === 180 && mech[0].values[0].ref === 73);

// ─── 3. Aim ──────────────────────────────────────────────

const am = (type: AimMoment["type"], over: Partial<AimMoment> = {}): AimMoment => ({
  type, roundNumber: 5, tick: 9000, roundTime: 30, value: 20, detail: "x", costly: false, enemy: E, ...over,
});
const aim = fromAim([
  {
    steamId: P,
    moments: [
      am("crosshair", { value: 35, costly: true }),
      am("crosshair", { value: 18 }),
      am("reaction", { value: 650, costly: true }),
      am("spray", { value: 9, enemy: undefined }),
      am("overflick", { value: 5 }),
      am("dry_peek", { value: 240, costly: true }),
      am("noise", { value: 1.2, costly: true }),
      am("jump", { value: 600 }),
      am("air_shot", { weapon: "ak47", value: 250, enemy: undefined }),
      am("air_shot", { weapon: "ssg08", value: 10, enemy: undefined }),
      am("reload", { value: -1, costly: true }),
    ],
  },
]);
const byType = (t: string) => aim.filter((f) => f.type === t);
check("one finding per aim moment, SSG jump shot skipped", aim.length === 10 && byType("air_shot").length === 1);
check("costly 35° crosshair = high", byType("crosshair")[0].severity === "high");
check("18° crosshair that did not cost = low", byType("crosshair")[1].severity === "low");
check("650 ms reaction = high", byType("reaction")[0].severity === "high");
check("lost dry peek = high", byType("dry_peek")[0].severity === "high");
check("costly noise = high, plain jump = medium", byType("noise")[0].severity === "high" && byType("jump")[0].severity === "medium");
check("enemy becomes the clip target", byType("dry_peek")[0].targetSteamId === E && byType("spray")[0].targetSteamId === null);
check("reload without clip data has no clip value", byType("reload")[0].values.length === 0);
check("aim categories", byType("dry_peek")[0].category === "duels" && byType("noise")[0].category === "sound" && byType("crosshair")[0].category === "aim");

// ─── 4. Every finding ────────────────────────────────────

const all = detectFindings({ mechanics: [{ steamId: P, moments: [mv({})] }], aim: [{ steamId: P, moments: [am("dry_peek", { costly: true }), am("crosshair", { roundNumber: 1 })] }] });
check("detectFindings sorts by round, tick", all.map((f) => f.roundNumber).join(",") === "1,3,5");
check(
  "every finding has round, tick, advice, category of its type",
  [...mech, ...aim].every(
    (f) => f.roundNumber > 0 && f.tick > 0 && f.advice.length > 20 && f.category === FINDING_TYPES[f.type].category
  )
);

// ─── 5. Metrics ──────────────────────────────────────────

const mechSummary: MechanicsSummary = {
  firstShots: 40, firstShotsMoving: 16, firstShotHits: 8, hits: 60, headHits: 33,
  counterStrafes: 3, counterStrafeAvgMs: 220,
};
const aimSummary: AimSummary = {
  duels: 30, duelsUnseen: 4,
  crosshairSamples: 20, crosshairAvgDeg: 9, crosshairMedianDeg: 8, crosshairBad: 4,
  reactionSamples: 12, reactionMedianMs: 280,
  ttdSamples: 2, ttdMedianMs: 900,
  sprays: 5, sprayBullets: 30, sprayHits: 3,
  flicks: 4, trackings: 6, preaims: 5, overflicks: 1,
  peeks: 10, peeksWon: 3, dryPeeks: 6, dryPeeksLost: 5,
  noiseEpisodes: 1, noiseCostly: 1, jumps: 4, jumpsNearEnemy: 0, airShots: 1,
  reloads: 8, badReloads: 1, reloadData: true,
};
const metrics = playerMetrics(mechSummary, aimSummary);
const metric = (k: string) => metrics.find((m) => m.key === k)!;
check("14 metrics (4 mechanics + 10 aim)", metrics.length === 14);
check("40% first shots moving = bad", metric("moving_first").value === 40 && metric("moving_first").status === "bad");
check("counter-strafe over 3 samples is not judged", metric("strafe").status === "none");
check("time to damage over 2 samples is not judged", metric("ttd").status === "none");
check("20% first bullet = bad, 55% HS = good", metric("first_bullet").status === "bad" && metric("hs").status === "good");
check("reaction 280 ms = good", metric("reaction").status === "good");
check("count metrics are judged at any sample size", metric("noise").status === "good");
check("formatMetric", formatMetric({ value: 8, unit: "°" }) === "8°" && formatMetric({ value: 280, unit: "ms" }) === "280 ms" && formatMetric({ value: null, unit: "%" }) === "–");

// ─── 6. Report ───────────────────────────────────────────

const findings = [
  ...fromMechanics([{ steamId: P, moments: [mv({}), mv({ tick: 6000, roundNumber: 4 }), mv({ hit: true, roundNumber: 7 })] }]),
  ...fromAim([{
    steamId: P,
    moments: [
      am("dry_peek", { costly: true, roundNumber: 2 }),
      am("dry_peek", { costly: true, roundNumber: 6 }),
      am("dry_peek", { costly: true, roundNumber: 9 }),
      am("air_shot", { weapon: "ak47" }),
      am("air_shot", { weapon: "ak47", roundNumber: 8 }),
      am("crosshair", { value: 18, roundNumber: 10 }),
    ],
  }]),
];
const report = buildReport(findings, metrics);
const topTypes = report.top.map((i) => i.type);
check("top 3 = moving shots, dry peeks, first bullet (metric only)", report.top.length === 3 &&
  ["moving_shot", "dry_peek", "first_bullet"].every((t) => topTypes.includes(t)));
check("air shots (2 low) never in top 3", !topTypes.includes("air_shot"));
check("issues sorted by score", report.issues.every((x, i, a) => i === 0 || a[i - 1].score >= x.score));
const fb = report.issues.find((i) => i.type === "first_bullet")!;
check("metric-only issue has no moments, keeps its metric", fb.findings.length === 0 && fb.metric?.key === "first_bullet" && fb.severity === "high");
const dp = report.issues.find((i) => i.type === "dry_peek")!;
check("dry peek issue: 3 high, all costly, worst first", dp.high === 3 && dp.costly === 3 && dp.findings[0].severity === "high");
const ms = report.issues.find((i) => i.type === "moving_shot")!;
check("moving shot findings ordered high → low", ms.findings[0].severity === "high" && ms.findings[ms.findings.length - 1].severity === "low");
check("strengths = good metrics (HS, reaction…)", report.strengths.some((m) => m.key === "hs") && report.strengths.some((m) => m.key === "reaction") && report.strengths.every((m) => m.status === "good"));
check("a good metric with moments is not in the top", !topTypes.includes("crosshair") || metric("crosshair").status !== "good");
check("8 categories, planned ones empty", report.byCategory.length === 8 &&
  report.byCategory.filter((c) => c.category.plannedIn).every((c) => c.issues.length === 0));
check("shooting category holds moving shots and first bullet", report.byCategory.find((c) => c.category.key === "shooting")!.issues.some((i) => i.type === "first_bullet"));
check("totals", report.totals.findings === findings.length && report.totals.rounds === new Set(findings.map((f) => f.roundNumber)).size &&
  report.totals.high + report.totals.medium + report.totals.low === findings.length);

const empty = buildReport([], playerMetrics(null, null));
check("no data → empty report", empty.top.length === 0 && empty.issues.length === 0 && empty.strengths.length === 0);

// ─── Report ──────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
