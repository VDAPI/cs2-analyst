/**
 * Regression test for clips, highlights and friends (S25).
 * Run: npm run test:social
 *
 * Checks:
 * 1. highlights: won clutches (per-round sides, as on the match page),
 *    lost clutches skipped, 3K/4K/ace, team kills not counted, clip window
 *    (lead-in, tail, inside the round, capped), marks and ranking,
 * 2. clips: shared clip schema (range, focus, cap), finding/highlight share
 *    forms, export frame plan (fps, hold), file names, titles,
 * 3. friends ranking: direction, ties, too few matches, window,
 * 4. weekly challenges: deterministic, three groups, same week = same set,
 *    progress counts only this week's matches, by direction,
 * 5. friend invite codes, PL/EN copy for clips, friends and the new
 *    notifications, notification text.
 *
 * No demo file or database required — everything here is pure.
 */
import { detectClutchesBySide } from "@/lib/utils/clutches";
import { createSideResolver, type Side } from "@/lib/utils/sideSplit";
import { clipWindow, detectHighlights, highlightScore, multiKind, type HighlightRound } from "@/lib/clips/highlights";
import {
  EXPORT_HOLD_S,
  EXPORT_SETTINGS,
  MAX_CLIP_SECONDS,
  clipFileName,
  clipShareSchema,
  exportTicks,
  findingClipShare,
  highlightClipShare,
  highlightTitle,
  parseClipShare,
} from "@/lib/clips/clip";
import { MIN_RANKING_MATCHES, RANKING_METRICS, RANKING_WINDOW, isRankingMetric, rankPlayers } from "@/lib/friends/ranking";
import { CHALLENGE_POOL, CHALLENGES_PER_WEEK, challengeWeek, challengesForWeek, evaluateChallenge } from "@/lib/friends/challenges";
import { buildHistory, progressMetric, type MatchInput } from "@/lib/progress/metrics";
import { isFriendCode, newFriendCode, friendPath } from "@/lib/friends/load";
import { notificationView, toNotificationData } from "@/lib/notifications/text";
import { createT } from "@/lib/i18n/translate";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const T = 64;

// ─── 1. Highlights ─────────────────────────────────────────

// Team A finished on CT: a1..a5; team B finished on T: b1..b5. Rounds 1–12
// teamA plays T (sides swap at halftime), 13+ CT.
const A = ["a1", "a2", "a3", "a4", "a5"];
const B = ["b1", "b2", "b3", "b4", "b5"];
const finalTeam = new Map<string, Side>([...A.map((s) => [s, "CT"] as [string, Side]), ...B.map((s) => [s, "T"] as [string, Side])]);

const kill = (tick: number, attacker: string, victim: string, headshot = false) => ({
  tick,
  attackerSteamId: attacker,
  victimSteamId: victim,
  weapon: "ak47",
  headshot,
});

// Scores so createSideResolver sees teamA as T in round 1-12 and CT afterwards.
type R = HighlightRound & { ctScore: number; tScore: number };
const rounds: R[] = [];
let aScore = 0;
let bScore = 0;
function addRound(number: number, winnerTeam: "A" | "B", kills: ReturnType<typeof kill>[], start = number * 10_000) {
  const aSide: Side = number <= 12 ? "T" : "CT";
  if (winnerTeam === "A") aScore++;
  else bScore++;
  const winner: Side = winnerTeam === "A" ? aSide : aSide === "CT" ? "T" : "CT";
  rounds.push({ number, startTick: start, endTick: start + 115 * T, winner, kills, ctScore: aScore, tScore: bScore });
}

// R1: a1 wins a 1v3 clutch (4 teammates die first), killing 3.
addRound(1, "A", [
  kill(10_000 + 10 * T, "b1", "a2"),
  kill(10_000 + 12 * T, "b2", "a3"),
  kill(10_000 + 14 * T, "a4", "b5"),
  kill(10_000 + 15 * T, "a4", "b4"),
  kill(10_000 + 16 * T, "b3", "a4"),
  kill(10_000 + 20 * T, "b1", "a5"),
  kill(10_000 + 30 * T, "a1", "b1", true),
  kill(10_000 + 35 * T, "a1", "b2"),
  kill(10_000 + 40 * T, "a1", "b3", true),
]);
// R2: b4 gets an ace.
addRound(2, "B", [
  kill(20_000 + 5 * T, "b4", "a1"),
  kill(20_000 + 8 * T, "b4", "a2"),
  kill(20_000 + 12 * T, "b4", "a3"),
  kill(20_000 + 20 * T, "b4", "a4"),
  kill(20_000 + 25 * T, "b4", "a5"),
]);
// R3: a2 kills 3, one of them a team kill → only 2 frags, no highlight; b1 is in a 1v2 and loses.
addRound(3, "A", [
  kill(30_000 + 5 * T, "a2", "a3"),
  kill(30_000 + 6 * T, "a2", "b2"),
  kill(30_000 + 7 * T, "a2", "b3"),
  kill(30_000 + 8 * T, "a1", "b4"),
  kill(30_000 + 9 * T, "a4", "b5"),
  kill(30_000 + 30 * T, "a1", "b1"),
]);
// R13 (teamA now CT): a3 gets a 4K spread over 50 s → window capped at MAX_CLIP_SECONDS.
addRound(13, "A", [
  kill(130_000 + 2 * T, "a3", "b1"),
  kill(130_000 + 20 * T, "a3", "b2"),
  kill(130_000 + 40 * T, "a3", "b3"),
  kill(130_000 + 52 * T, "a3", "b4"),
  kill(130_000 + 53 * T, "a1", "b5"),
]);

const sideAt = createSideResolver(rounds);
const highlights = detectHighlights({ rounds, finalTeamBySteamId: finalTeam, sideAt });
const byKey = new Map(highlights.map((h) => [h.key, h]));

const clutch = byKey.get("1-a1");
check("won 1v3 clutch found", clutch?.kind === "clutch" && clutch.clutch === 3 && clutch.kills === 3);
check("clutcher played T in round 1 (per-round sides)", clutch?.side === "T");
check(
  "clutch window starts before the clutch began and ends after the last kill",
  !!clutch && clutch.from === 10_000 + 20 * T - 3 * T && clutch.to === Math.round(10_000 + 40 * T + 2.5 * T)
);
check("clutch marks are its kills", clutch?.marks.length === 3 && clutch.focus === 10_000 + 40 * T);
check("headshots counted", clutch?.headshots === 2);
const pageClutches = detectClutchesBySide({
  rounds: rounds.map((r) => ({ id: String(r.number), number: r.number, winner: r.winner, kills: r.kills })),
  finalTeamBySteamId: finalTeam,
  sideAt,
});
check(
  "clutch matches the match page's detection (who, size, won)",
  pageClutches.some((c) => c.roundNumber === 1 && c.clutcherSteamId === "a1" && c.size === 3 && c.won)
);

const ace = byKey.get("2-b4");
check("ace found", ace?.kind === "ace" && ace.kills === 5 && ace.marks.length === 5);
check("an ace outranks a 1v3 clutch with 3 kills", (ace?.score ?? 0) > (clutch?.score ?? 0));
check("team kill is not a frag (no 3K for a2)", !byKey.has("3-a2"));
check("lost clutch is not a highlight", !byKey.has("3-b1"));
const fourK = byKey.get("13-a3");
check("4K found", fourK?.kind === "4k" && fourK.kills === 4);
check("long highlight is capped", !!fourK && fourK.to - fourK.from === MAX_CLIP_SECONDS * T);
check("capped highlight keeps the end and drops early marks", !!fourK && fourK.marks.length === 2 && fourK.to > 130_000 + 52 * T);
check("highlights sorted best first", highlights.every((h, i) => i === 0 || highlights[i - 1].score >= h.score));
check("multiKind", multiKind(2) === null && multiKind(3) === "3k" && multiKind(4) === "4k" && multiKind(7) === "ace");
check("combined clutch + multi-kill beats either alone", highlightScore(3, 3) > highlightScore(3, null) && highlightScore(3, 3) > highlightScore(1, 3));
const w = clipWindow(1000, 1100, { startTick: 990, endTick: 1050 });
check("clip window stays inside the round", w.from === 990 && w.to === 1050);

// ─── 2. Clips ──────────────────────────────────────────────

const share = highlightClipShare(clutch!);
check("highlight share passes the schema", clipShareSchema.safeParse(share).success && share.follow === true);
check("parseClipShare round trip", JSON.stringify(parseClipShare(JSON.parse(JSON.stringify(share)))) === JSON.stringify(share));
check("schema refuses a too long clip", !clipShareSchema.safeParse({ ...share, to: share.from + MAX_CLIP_SECONDS * T + 1 }).success);
check("schema refuses an empty range", !clipShareSchema.safeParse({ ...share, to: share.from }).success);
check("schema refuses focus outside the range", !clipShareSchema.safeParse({ ...share, focus: share.to + 1 }).success);
check("schema refuses an unknown kind", !clipShareSchema.safeParse({ ...share, kind: "noscope" }).success);
check("schema caps marks", !clipShareSchema.safeParse({ ...share, marks: Array.from({ length: 11 }, (_, i) => share.from + i) }).success);
check("parseClipShare rejects junk", parseClipShare(null) === null && parseClipShare({ from: "x" }) === null);
const fShare = findingClipShare({ type: "moving_shot", tick: 5000, severity: "high", targetSteamId: "b1" }, { before: 3, after: 2 });
check(
  "finding share keeps the report's window",
  fShare.from === 5000 - 3 * T && fShare.to === 5000 + 2 * T && fShare.kind === "finding" && !fShare.follow && clipShareSchema.safeParse(fShare).success
);
check("finding share never starts below tick 0", findingClipShare({ type: "x", tick: 10, severity: "low", targetSteamId: null }, { before: 3, after: 2 }).from === 0);

const ticks = exportTicks(1000, 1000 + 10 * T, 30);
const hold = Math.round(EXPORT_HOLD_S * 30);
check("export plan: 30 fps of game time plus the hold", ticks.length === 300 + 1 + hold);
check("export plan starts at from and ends held at to", ticks[0] === 1000 && ticks.slice(-hold - 1).every((x) => x === 1000 + 10 * T));
check("export plan is non-decreasing", ticks.every((x, i) => i === 0 || x >= ticks[i - 1]));
check("export sizes are even (H.264) and GIF is smaller", EXPORT_SETTINGS.mp4.size % 2 === 0 && EXPORT_SETTINGS.gif.size < EXPORT_SETTINGS.mp4.size);
check(
  "file name is ASCII and readable",
  clipFileName({ map: "Mirage", round: 14, label: "Clutch 1v3 · 3K" }, "mp4") === "cs2-analyst-mirage-r14-clutch-1v3-3k.mp4" &&
    clipFileName({ map: "de_nuke", round: 2, label: "Śmierć bez wymiany" }, "gif") === "cs2-analyst-nuke-r2-smierc-bez-wymiany.gif"
);
const tpl = createT("pl");
const ten = createT("en");
check("clutch title", highlightTitle(tpl, { kind: "clutch", clutch: 3, kills: 3 }) === "Clutch 1v3 · 3K");
check("clutch ace title", highlightTitle(ten, { kind: "clutch", clutch: 5, kills: 5 }) === "Clutch 1v5 · Ace");
check("plain titles", highlightTitle(tpl, { kind: "4k" }) === "4K" && highlightTitle(ten, { kind: "ace" }) === "Ace");

// ─── 3. Ranking ────────────────────────────────────────────

let seq = 0;
const m = (date: string, p: Partial<MatchInput["player"]> = {}): MatchInput => ({
  matchId: `m${++seq}`,
  date,
  map: "de_mirage",
  scoreCT: 13,
  scoreT: 9,
  rounds: 22,
  player: { name: "x", team: "CT", kills: 18, deaths: 15, adr: 80, hltvRating: 1.0, hsPercent: 45, firstKills: 2, clutchWins: 0, ...p },
  mech: { firstShots: 20, firstShotsMoving: 4, firstShotHits: 6, hits: 30, headHits: 12, counterStrafes: 15, counterStrafeAvgMs: 120 },
  aim: null,
  tactics: null,
  utility: null,
  findings: { high: 1, medium: 0, low: 0 },
});
const days = (n: number, p: Partial<MatchInput["player"]>, month = 9) =>
  Array.from({ length: n }, (_, i) => m(new Date(Date.UTC(2026, month, 1 + i)).toISOString(), p));

const ranking = rankPlayers(
  [
    { userId: "me", name: "Ja", isMe: true, matches: days(4, { adr: 90 }) },
    { userId: "f1", name: "Ania", isMe: false, matches: days(5, { adr: 95 }) },
    { userId: "f2", name: "Bartek", isMe: false, matches: days(3, { adr: 90 }) },
    { userId: "f3", name: "Celina", isMe: false, matches: days(2, { adr: 140 }) },
  ],
  "adr"
);
check("ranking by direction (higher ADR first)", ranking[0].userId === "f1" && ranking[0].rank === 1);
check("ties share a place", ranking[1].rank === 2 && ranking[2].rank === 2);
check("too few matches → no place, listed last", ranking[3].userId === "f3" && ranking[3].rank === null && ranking[3].matches < MIN_RANKING_MATCHES);
const lower = rankPlayers(
  [
    { userId: "a", name: "A", isMe: true, matches: days(3, {}).map((x) => ({ ...x, findings: { high: 3, medium: 0, low: 0 } })) },
    { userId: "b", name: "B", isMe: false, matches: days(3, {}) },
  ],
  "serious"
);
check("lower-is-better metric ranks the lower value first", lower[0].userId === "b");
const windowed = rankPlayers(
  [{ userId: "a", name: "A", isMe: true, matches: [...days(RANKING_WINDOW, { adr: 100 }, 9), ...days(5, { adr: 10 }, 1)] }],
  "adr"
);
check("only the latest RANKING_WINDOW matches count", windowed[0].value === 100 && windowed[0].matches === RANKING_WINDOW);
check("ranking metrics are known progress metrics", RANKING_METRICS.every((k) => !!progressMetric(k)) && isRankingMetric("adr") && !isRankingMetric("x"));

// ─── 4. Weekly challenges ─────────────────────────────────

const week = challengeWeek(new Date("2026-10-14T12:00:00Z")); // Wednesday
check("week is its Monday (Warsaw)", week === "2026-10-12");
check("Sunday night in Warsaw is still the same week", challengeWeek(new Date("2026-10-18T21:30:00Z")) === "2026-10-12");
check("Monday 00:30 Warsaw starts a new week", challengeWeek(new Date("2026-10-18T22:30:00Z")) === "2026-10-19");
const set = challengesForWeek(week);
check("three challenges a week", set.length === CHALLENGES_PER_WEEK);
check("from three different groups", new Set(set.map((c) => c.group)).size === CHALLENGES_PER_WEEK);
check("same week, same challenges", JSON.stringify(challengesForWeek(week)) === JSON.stringify(set));
const weeks = Array.from({ length: 12 }, (_, i) => challengesForWeek(`2026-${String(1 + i).padStart(2, "0")}-05`).map((c) => c.id).join());
check("challenges change between weeks", new Set(weeks).size > 6);
check("pool metrics are progress metrics", CHALLENGE_POOL.every((c) => !!progressMetric(c.metric) && c.matches >= 1));

const adrChallenge = CHALLENGE_POOL.find((c) => c.id === "adr-80")!;
const thisWeek = [
  m("2026-10-12T18:00:00Z", { adr: 85 }),
  m("2026-10-13T18:00:00Z", { adr: 70 }),
  m("2026-10-14T18:00:00Z", { adr: 92 }),
];
const lastWeek = [m("2026-10-10T18:00:00Z", { adr: 120 }), m("2026-10-09T18:00:00Z", { adr: 120 })];
const prog = evaluateChallenge(adrChallenge, buildHistory([...lastWeek, ...thisWeek]), week);
check("only this week's matches count", prog.done === 2 && !prog.completed && prog.best === 92);
const done = evaluateChallenge(adrChallenge, buildHistory([...thisWeek, m("2026-10-15T18:00:00Z", { adr: 81 })]), week);
check("completed at the needed count", done.completed && done.done === adrChallenge.matches);
const still = CHALLENGE_POOL.find((c) => c.id === "serious-1")!;
const lowerProg = evaluateChallenge(
  still,
  buildHistory([
    { ...m("2026-10-12T18:00:00Z"), findings: { high: 0, medium: 0, low: 0 } },
    { ...m("2026-10-13T18:00:00Z"), findings: { high: 5, medium: 0, low: 0 } },
  ]),
  week
);
check("lower-is-better challenge counts values at or under the target", lowerProg.done === 1 && lowerProg.best === 0);

// ─── 5. Codes, copy, notifications ────────────────────────

const code = newFriendCode();
check("friend codes are 12 URL-safe characters", isFriendCode(code) && !isFriendCode("short") && !isFriendCode("../../etc/pa"));
check("friend invite path", friendPath(code) === `/friends/add/${code}`);

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [`${p}${k}`] : keys(v as object, `${p}${k}.`)));
for (const ns of ["clips", "friends"] as const) {
  const a = keys(pl[ns]).sort();
  const b = keys(en[ns]).sort();
  check(`PL/EN ${ns}: same keys`, JSON.stringify(a) === JSON.stringify(b) && a.length > 20);
}
check("nav labels", !!pl.nav.clips && !!en.nav.clips && !!pl.nav.friends && !!en.nav.friends);
check("shares label for clips", pl.shares.clip.includes("{round}") && en.shares.clip.includes("{round}"));

const req = notificationView(tpl, { type: "FRIEND_REQUEST", matchId: null, data: toNotificationData({ name: "Ania" }) });
check("friend request notification", req.body.includes("Ania") && req.url === "/friends");
const acc = notificationView(ten, { type: "FRIEND_ACCEPTED", matchId: null, data: {} });
check("friend accepted notification without a name", acc.body.includes(en.notifications.someone) && acc.url === "/friends");

// ─── Report ────────────────────────────────────────────────
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exit(1);
