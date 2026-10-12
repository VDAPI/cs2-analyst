/**
 * Regression test for teams (S17). Run: npm run test:team
 *
 * Checks:
 * 1. roster and team matches: who counts as the team, how many must play
 *    together, rival matches, ownership hand-over, SteamID lists, invite codes,
 * 2. dashboard: per-round sides across halftime, pistols, post-plant /
 *    retakes, round-weighted player lines, mistakes per 10 rounds,
 * 3. anti-strat on a simulated rival: site preference, execute pace and
 *    utility, CT setups and stacks, retakes, buys after a lost pistol,
 *    insights with their numbers, typical positions for the board,
 * 4. tactic board data: validation and size bounds, world → board positions,
 *    strokes, steps, ids,
 * 5. PL/EN copy for every insight, navigation.
 *
 * No demo file or database required — everything here is pure.
 */
import {
  ANTISTRAT_MIN_TOGETHER,
  canEditItem,
  canManageContent,
  canManageTeam,
  isInviteCode,
  isSteamId64,
  minTogether,
  nextOwner,
  parseSteamIdList,
  rivalSideInMatch,
  rosterSteamIds,
  teamSideInMatch,
  type MatchPlayerSide,
} from "@/lib/team/roster";
import { newInviteCode } from "@/lib/team/invite";
import { buildTeamDashboard, isPistolRound, type TeamMatchInput } from "@/lib/team/stats";
import {
  analyzeRival,
  buyKind,
  paceOf,
  zoneOf,
  type AntiStratGrenade,
  type AntiStratMatch,
  type AntiStratMapContext,
  type Insight,
} from "@/lib/team/antistrat";
import type { TacticsBomb, TacticsEcon, TacticsFrame, TacticsRound } from "@/lib/analysis/tactics";
import {
  MAX_BOARD_BYTES,
  MAX_POINTS,
  MAX_STEPS,
  boardFromTokens,
  emptyBoard,
  newItemId,
  nextStep,
  parseBoardData,
  simplifyStroke,
  worldToBoard,
} from "@/lib/team/board";
import { interpolateItems, moveBoardItem, hitBoardItem } from "@/lib/canvas/board-draw";
import { makeWorldToCanvas } from "@/lib/canvas/radar";
import { getMapConfig } from "@/lib/utils/maps";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";
import { navGroups } from "@/components/layout/nav-items";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

const sid = (n: number) => `7656119800000${String(n).padStart(4, "0")}`;
const OURS = [1, 2, 3, 4, 5].map(sid);
const THEM = [11, 12, 13, 14, 15].map(sid);

// ─── 1. Roster ───────────────────────────────────────────
{
  check("SteamID64 format", isSteamId64(OURS[0]) && !isSteamId64("123") && !isSteamId64("76561198x00000001"));
  const roster = rosterSteamIds(
    [
      { steamId: null, accountSteamId: OURS[0] },
      { steamId: OURS[1], accountSteamId: sid(99) }, // own pick wins over the linked account
      { steamId: null, accountSteamId: null }, // no Steam yet: not in the roster
    ],
    [OURS[2], OURS[1]]
  );
  check("roster: linked Steam, own pick, extras, de-duplicated", roster.length === 3 && roster.includes(OURS[0]) && roster.includes(OURS[1]) && !roster.includes(sid(99)));
  check("3 must play together in a full team, 2 in a duo", minTogether(5) === 3 && minTogether(3) === 3 && minTogether(2) === 2);

  const players = (ours: string[], side: "CT" | "T"): MatchPlayerSide[] => [
    ...ours.map((steamId) => ({ steamId, team: side })),
    ...THEM.map((steamId) => ({ steamId, team: side === "CT" ? ("T" as const) : ("CT" as const) })),
  ];
  check("team match: 3 of the roster on T", teamSideInMatch(players(OURS.slice(0, 3), "T"), OURS) === "T");
  check("not a team match: only 2 of a 5-man roster", teamSideInMatch(players(OURS.slice(0, 2), "CT"), OURS) === null);
  check("duo: 2 together is enough", teamSideInMatch(players(OURS.slice(0, 2), "CT"), OURS.slice(0, 2)) === "CT");
  check("a single SteamID is no team", teamSideInMatch(players(OURS.slice(0, 1), "CT"), OURS.slice(0, 1)) === null);
  const split: MatchPlayerSide[] = [
    { steamId: OURS[0], team: "CT" },
    { steamId: OURS[1], team: "T" },
    { steamId: OURS[2], team: "T" },
    { steamId: OURS[3], team: "T" },
  ];
  check("roster on both sides: the side with more of them", teamSideInMatch(split, OURS) === "T");
  check("rival match: 3 of theirs together", rivalSideInMatch(players(OURS.slice(0, 1), "CT"), THEM.slice(0, 3)) === "T");
  check("rival with fewer than 3 known players: all of them must play", rivalSideInMatch(players([], "CT"), THEM.slice(0, 2)) === "T" && ANTISTRAT_MIN_TOGETHER === 3);

  const members = [
    { userId: "a", role: "OWNER" as const, joinedAt: "2026-01-01" },
    { userId: "b", role: "PLAYER" as const, joinedAt: "2026-01-02" },
    { userId: "c", role: "COACH" as const, joinedAt: "2026-02-01" },
  ];
  check("owner leaves: the coach takes over", nextOwner(members, "a")?.userId === "c");
  check("no coach: the longest member", nextOwner(members.filter((m) => m.userId !== "c"), "a")?.userId === "b");
  check("last member: nobody", nextOwner([members[0]], "a") === null);
  check("roles: owner manages, coach edits content", canManageTeam("OWNER") && !canManageTeam("COACH") && canManageContent("COACH") && !canManageContent("PLAYER"));
  check("boards: author or owner/coach", canEditItem("PLAYER", "u1", "u1") && !canEditItem("PLAYER", "u1", "u2") && canEditItem("COACH", "u1", "u2") && !canEditItem("PLAYER", "u1", null));

  const list = parseSteamIdList(` ${OURS[0]}, ${OURS[1]}\n${OURS[0]}; abc 123 `);
  check("SteamID list: valid de-duplicated, invalid reported", list.ids.length === 2 && list.invalid.join(",") === "abc,123");
  const codes = new Set(Array.from({ length: 50 }, () => newInviteCode()));
  check("invite codes: 12 URL-safe chars, unique", [...codes].every(isInviteCode) && codes.size === 50);
  check("invite code check refuses junk", !isInviteCode("short") && !isInviteCode("../../etc/pa") && !isInviteCode(null));
}

// ─── 2. Dashboard ────────────────────────────────────────
{
  // Team finishes on CT (= teamA). Rounds 1–12 it plays T, 13–16 CT. Score 10–6.
  const winners: Array<"CT" | "T"> = ["T", "T", "CT", "T", "T", "CT", "T", "CT", "T", "T", "CT", "T", "CT", "CT", "T", "CT"];
  let a = 0;
  let b = 0;
  const rounds = winners.map((w, i) => {
    const n = i + 1;
    const teamASide = n <= 12 ? "T" : "CT";
    if (w === teamASide) a++;
    else b++;
    return { number: n, winner: w, ctScore: a, tScore: b, planted: n === 2 || n === 3 || n === 15 };
  });
  const match: TeamMatchInput = {
    matchId: "m1",
    map: "de_mirage",
    date: "2026-10-01T19:00:00Z",
    teamSide: "CT",
    scoreCT: a,
    scoreT: b,
    rounds,
    players: [
      { steamId: OURS[0], name: "one", team: "CT", kills: 20, deaths: 10, assists: 3, adr: 90, hltvRating: 1.3, firstKills: 4, firstDeaths: 2, clutchWins: 1, clutchAttempts: 2, utilityDamage: 50, flashAssists: 1 },
      { steamId: OURS[1], name: "two", team: "CT", kills: 10, deaths: 14, assists: 5, adr: 60, hltvRating: 0.9, firstKills: 1, firstDeaths: 3, clutchWins: 0, clutchAttempts: 1, utilityDamage: 80, flashAssists: 3 },
      { steamId: OURS[2], name: "three", team: "CT", kills: 12, deaths: 12, assists: 2, adr: 70, hltvRating: 1.0, firstKills: 2, firstDeaths: 2, clutchWins: 0, clutchAttempts: 0, utilityDamage: 10, flashAssists: 0 },
      { steamId: sid(50), name: "pug", team: "CT", kills: 5, deaths: 15, assists: 1, adr: 40, hltvRating: 0.6, firstKills: 0, firstDeaths: 4, clutchWins: 0, clutchAttempts: 0, utilityDamage: 0, flashAssists: 0 },
      { steamId: THEM[0], name: "rival", team: "T", kills: 18, deaths: 12, assists: 2, adr: 85, hltvRating: 1.2, firstKills: 5, firstDeaths: 1, clutchWins: 0, clutchAttempts: 0, utilityDamage: 0, flashAssists: 0 },
    ],
    trades: [
      { steamId: OURS[0], deaths: 10, tradedDeaths: 4, tradeChances: 5, tradesMade: 3 },
      { steamId: sid(50), deaths: 15, tradedDeaths: 5, tradeChances: 2, tradesMade: 1 },
      { steamId: THEM[0], deaths: 12, tradedDeaths: 6, tradeChances: 3, tradesMade: 2 },
    ],
    findings: [
      { steamId: OURS[0], type: "untraded_death", category: "teamplay", severity: "high" },
      { steamId: OURS[0], type: "untraded_death", category: "teamplay", severity: "medium" },
      { steamId: OURS[1], type: "untraded_death", category: "teamplay", severity: "medium" },
      { steamId: OURS[1], type: "smoke_early", category: "utility", severity: "low" },
      { steamId: THEM[0], type: "untraded_death", category: "teamplay", severity: "high" }, // the enemy's: not ours
      { steamId: sid(50), type: "untraded_death", category: "teamplay", severity: "high" }, // not in the roster
    ],
  };
  const second: TeamMatchInput = { ...match, matchId: "m2", date: "2026-10-02T19:00:00Z", map: "de_inferno", players: match.players.map((p) => (p.steamId === OURS[0] ? { ...p, adr: 120, hltvRating: 1.6, name: "one_new" } : p)), rounds: rounds.slice(0, 8), scoreCT: 6, scoreT: 2 };
  const d = buildTeamDashboard([match, second], OURS);

  const tRoundsWon = winners.slice(0, 12).filter((w) => w === "T").length;
  const ctRoundsWon = winners.slice(12).filter((w) => w === "CT").length;
  check("record: two wins", d.matches === 2 && d.wins === 2 && d.losses === 0);
  check("sides per round across halftime", d.t.played === 12 + 8 && d.t.won === tRoundsWon + winners.slice(0, 8).filter((w) => w === "T").length && d.ct.played === 4 && d.ct.won === ctRoundsWon);
  check("pistols: rounds 1 and 13", isPistolRound(1) && isPistolRound(13) && !isPistolRound(25) && d.pistols.played === 3 && d.pistols.won === 3);
  check("post-plant on T, retakes on CT", d.postPlant.played === 4 && d.postPlant.won === 2 && d.retakes.played === 1 && d.retakes.won === 0);
  check("maps sorted, newest name kept", d.maps.length === 2 && d.players.find((p) => p.steamId === OURS[0])?.name === "one_new");
  const one = d.players.find((p) => p.steamId === OURS[0])!;
  check("ADR / rating weighted by rounds", near(one.adr, Math.round(((90 * 16 + 120 * 8) / 24) * 10) / 10) && near(one.rating, Math.round(((1.3 * 16 + 1.6 * 8) / 24) * 100) / 100));
  check("only roster players get a line", d.players.length === 3 && !d.players.some((p) => p.steamId === sid(50) || p.steamId === THEM[0]));
  check("trades count the team's side (pug included), not the enemy", d.trades.deaths === 50 && d.trades.traded === 18);
  const untraded = d.findings.find((f) => f.type === "untraded_death")!;
  check("mistakes: roster only, most common first", d.findings[0].type === "untraded_death" && untraded.count === 6 && untraded.high === 2 && untraded.players[0].steamId === OURS[0]);
  check("mistakes per 10 rounds", near(untraded.per10, Math.round((6 / 24) * 100) / 10));
  check("recent matches newest first with own score", d.recent[0].matchId === "m2" && d.recent[1].own === a && d.recent[1].opp === b);
}

// ─── 3. Anti-strat ───────────────────────────────────────
const TICK = 64;
const SITES = { A: { x: 1500, y: 0, z: 0 }, B: { x: -1500, y: 0, z: 0 } };
const ctx: AntiStratMapContext = {
  sites: SITES,
  place: (p) => (p.x > 1100 ? "Bombsite A" : p.x < -1100 ? "Bombsite B" : p.y > 600 ? "Palace" : "Mid"),
};

/** A round of frames every second: freeze 15 s, then `pos(id, second)` for every player. */
function simRound(
  number: number,
  winner: "CT" | "T",
  sides: Record<string, "CT" | "T">,
  pos: (id: string, s: number) => { x: number; y: number },
  seconds = 100
): TacticsRound {
  const startTick = number * 20_000;
  const frames: TacticsFrame[] = [];
  for (let s = 0; s <= seconds; s++) {
    const tick = startTick + s * TICK;
    frames.push({
      tick,
      players: Object.entries(sides).map(([steamId, team]) => {
        const p = s < 15 ? pos(steamId, 0) : pos(steamId, s - 15);
        const q = s < 15 ? p : pos(steamId, s - 14);
        return { steamId, team, x: p.x, y: p.y, z: 0, velX: (q.x - p.x) || (s >= 15 ? 5 : 0), velY: q.y - p.y, isAlive: true };
      }),
    });
  }
  return { number, startTick, endTick: startTick + seconds * TICK, winner, winReason: "elim", ctScore: 0, tScore: 0, frames };
}

const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({ x: a.x + (b.x - a.x) * Math.min(1, k), y: a.y + (b.y - a.y) * Math.min(1, k) });

{
  const rounds: TacticsRound[] = [];
  const bombs: TacticsBomb[] = [];
  const grenades: AntiStratGrenade[] = [];
  const economy: TacticsEcon[] = [];
  const spawnT = { x: 0, y: -2000 };
  // Rival = THEM, finishing on CT: T in rounds 1–12, CT in 13–24.
  for (let n = 1; n <= 24; n++) {
    const rivalSide = n <= 12 ? "T" : "CT";
    const sides: Record<string, "CT" | "T"> = {};
    for (const id of THEM) sides[id] = rivalSide;
    for (const id of OURS) sides[id] = rivalSide === "T" ? "CT" : "T";
    let pos: (id: string, s: number) => { x: number; y: number };
    let winner: "CT" | "T";
    if (rivalSide === "T") {
      // Rounds 1–8: fast B (4 on B by 20 s, plant at 22 s) after a smoke on B; 9–10: late A; 11–12: nothing.
      const target = n <= 8 ? SITES.B : n <= 10 ? SITES.A : { x: 0, y: 0 };
      const arrive = n <= 8 ? 20 : 80;
      pos = (id, s) => {
        if (THEM.includes(id)) {
          const i = THEM.indexOf(id);
          // Player 5 lurks far away on every T round.
          if (i === 4) return { x: 2500, y: 2500 };
          // B: walk straight in; A: wait in spawn, then go late.
          const k = n <= 8 ? s / arrive : Math.max(0, (s - (arrive - 10)) / 10);
          return lerp(spawnT, { x: target.x + i * 40, y: target.y + i * 40 }, k);
        }
        return { x: 0, y: 1500 };
      };
      winner = n <= 6 || n === 9 ? "T" : "CT";
      if (n <= 10) {
        const site = n <= 8 ? "B" : "A";
        const plantS = n <= 8 ? 22 : 82;
        bombs.push({ tick: n * 20_000 + (15 + plantS) * TICK, roundNumber: n, type: "PLANTED", playerSteamId: THEM[0], posX: target.x, posY: target.y, posZ: 0, site });
      }
      if (n <= 8) grenades.push({ roundNumber: n, tick: n * 20_000 + (15 + 12) * TICK, throwerSteamId: THEM[1], type: "SMOKE", landX: -1300, landY: 300, landZ: 0 });
    } else {
      // CT setup 2-1-2 on every CT round; the enemy plants A in 13–18 and the rival wins only 13.
      const spots = [SITES.A, { x: SITES.A.x + 100, y: 50 }, { x: 0, y: 0 }, SITES.B, { x: SITES.B.x - 100, y: 50 }];
      pos = (id) => (THEM.includes(id) ? spots[THEM.indexOf(id)] : { x: 0, y: -2000 });
      winner = n === 13 || n >= 19 ? "CT" : "T";
      if (n <= 18) bombs.push({ tick: n * 20_000 + 60 * TICK, roundNumber: n, type: "PLANTED", playerSteamId: OURS[0], posX: SITES.A.x, posY: SITES.A.y, posZ: 0, site: "A" });
      if (n === 13 || n === 14) grenades.push({ roundNumber: n, tick: n * 20_000 + 20 * TICK, throwerSteamId: THEM[2], type: "INCENDIARY", landX: 0, landY: 800, landZ: 0 });
    }
    rounds.push(simRound(n, winner, sides, pos));
    // Pistol lost (rounds 1 → false for 13? see below); round 14 after a lost 13? Rival won 13, so only round 2 counts.
    const equip = n === 1 || n === 13 ? 800 : n === 2 ? 2500 : 5000;
    for (const id of THEM) economy.push({ roundNumber: n, steamId: id, equipValue: equip, money: 1000 });
  }
  // Round 1 is lost by the rival here, to check the force after a lost pistol.
  rounds[0].winner = "CT";
  // Scores: teamA (finished CT) = the rival.
  let a = 0;
  let b = 0;
  for (const r of rounds) {
    const rivalSide = r.number <= 12 ? "T" : "CT";
    if (r.winner === rivalSide) a++;
    else b++;
    r.ctScore = a;
    r.tScore = b;
  }
  const kills: AntiStratMatch["kills"] = [];
  // Round 3: rival's first kill at "Palace"; the AWPer (THEM[0]) gets 6 AWP kills out of 10.
  kills.push({ tick: 3 * 20_000 + 18 * TICK, roundNumber: 3, attackerSteamId: THEM[2], victimSteamId: OURS[0], attackerPosX: 0, attackerPosY: 900, attackerPosZ: 0, victimPosX: 0, victimPosY: 1500, victimPosZ: 0, weapon: "ak47" });
  for (let i = 0; i < 10; i++) {
    kills.push({ tick: (14 + i) * 20_000 + 40 * TICK, roundNumber: 14 + (i % 10), attackerSteamId: THEM[0], victimSteamId: OURS[i % 5], attackerPosX: 1500, attackerPosY: 0, attackerPosZ: 0, victimPosX: 900, victimPosY: -500, victimPosZ: 0, weapon: i < 6 ? "awp" : "m4a1" });
  }
  const match: AntiStratMatch = {
    matchId: "r1",
    map: "de_mirage",
    date: "2026-10-01T19:00:00Z",
    tickRate: TICK,
    scoreCT: a,
    scoreT: b,
    rivalSide: "CT",
    rounds,
    kills,
    bombs,
    grenades,
    economy,
    players: THEM.map((steamId, i) => ({ steamId, name: `rival_${i + 1}`, team: "CT" as "CT" | "T", kills: i === 0 ? 10 : 5, deaths: 8, adr: 80, hltvRating: 1.1, firstKills: 2, firstDeaths: 1 })).concat(
      OURS.map((steamId, i) => ({ steamId, name: `our_${i + 1}`, team: "T" as "CT" | "T", kills: 5, deaths: 8, adr: 70, hltvRating: 1, firstKills: 1, firstDeaths: 1 }))
    ),
  };
  const report = analyzeRival({ rival: THEM, matches: [match], maps: { de_mirage: ctx } });
  const m = report.maps[0];

  check("zones: plant spots, mid, callout fallback", zoneOf({ x: 1400, y: 100, z: 0 }, ctx) === "A" && zoneOf({ x: 0, y: 0, z: 0 }, ctx) === "mid" && zoneOf({ x: 0, y: 0, z: 0 }, { sites: {}, place: () => "Bombsite B" }) === "B");
  check("buy kinds", buyKind(1, 900) === "pistol" && buyKind(2, 1000) === "eco" && buyKind(2, 2500) === "force" && buyKind(5, 5000) === "full");
  check("pace", paceOf(20) === "fast" && paceOf(50) === "default" && paceOf(90) === "late");
  check("T rounds and CT rounds split per round", m.t.rounds === 12 && m.ct.rounds === 12);
  check("site hits: B 8, A 2, none 2", m.t.sites.B === 8 && m.t.sites.A === 2 && m.t.sites.none === 2);
  const fastB = m.t.executes[0];
  check("main execute: fast B", fastB.site === "B" && fastB.pace === "fast" && fastB.rounds === 8 && fastB.planted === 8);
  check("execute timing ≈ when 2 Ts reach the site", fastB.hitS > 5 && fastB.hitS <= 22);
  check("execute utility: the B smoke in every round", fastB.utility[0]?.type === "SMOKE" && fastB.utility[0].place === "Bombsite B" && fastB.utility[0].rounds === 8);
  check("execute examples open the replay at the hit", fastB.examples.length > 0 && fastB.examples[0].matchId === "r1" && fastB.examples[0].round === 1);
  check("late A execute found", m.t.executes.some((e) => e.site === "A" && e.pace === "late" && e.rounds === 2));
  check("lurker found on T", m.t.lurkRounds === 12);
  check("CT setup 2-1-2 every round", m.ct.setups[0].A === 2 && m.ct.setups[0].mid === 1 && m.ct.setups[0].B === 2 && m.ct.setups[0].rounds === 12);
  check("no stacks with 2 per site", m.ct.stacks.A === 0 && m.ct.stacks.B === 0);
  check("retakes: 1 of 6 won", m.ct.retakes.rounds === 6 && m.ct.retakes.won === 1);
  check("CT early utility counted (incendiary as molotov)", m.ct.utility[0]?.type === "MOLOTOV" && m.ct.utility[0].place === "Palace" && m.ct.utility[0].rounds === 2);
  check("pistols: T lost, CT won", m.pistols.t.of === 1 && m.pistols.t.n === 0 && m.pistols.ct.of === 1 && m.pistols.ct.n === 1);
  check("force after the lost pistol", m.afterPistolLoss.force === 1 && m.afterPistolLoss.eco === 0);
  check("opening on T named by callout", m.t.openings[0]?.place === "Palace" && m.t.openings[0].kills === 1);
  check("defaults name the spots at 15 s", m.t.defaults.length > 0 && m.t.defaults.every((d) => d.of === 12));

  const awper = report.players.find((p) => p.steamId === THEM[0])!;
  check("AWPer and anchor roles", awper.awpKills === 6 && awper.roles.includes("awp") && awper.roles.includes("anchor") && awper.ctSpot?.place === "Bombsite A");
  check("lurker role", report.players.find((p) => p.steamId === THEM[4])!.roles.includes("lurk"));

  const has = (key: Insight["key"]) => report.insights.find((i) => i.key === key);
  const tSite = has("tSite");
  check("insight: they hit B, with the numbers", tSite?.params.site === "B" && tSite.params.n === 8 && tSite.params.of === 10 && tSite.params.pct === 80);
  check("insight: fast hits", has("tFast")?.params.n === 8);
  check("insight: main execute with its smoke and a replay moment", has("tExecute")?.params.type === "SMOKE" && !!has("tExecute")?.example);
  check("insight: weak retakes", has("retakeWeak")?.params.n === 1 && has("retakeWeak")?.params.of === 6);
  check("insight: CT setup", has("ctSetup")?.params.setup === "2-1-2");
  check("insight: AWPer named", has("awp")?.params.name === "rival_1");
  check("insights capped and sorted", report.insights.length <= 12 && report.insights.every((x, i, a) => i === 0 || a[i - 1].weight >= x.weight));
  check("board tokens: five CT spots, median positions", m.ct.board.length === 5 && m.ct.board.some((tkn) => tkn.x === SITES.A.x && tkn.y === SITES.A.y));

  // Same match, but the rival only known by 2 players: still analysed per round (sides from frames).
  const two = analyzeRival({ rival: THEM.slice(0, 2), matches: [{ ...match }], maps: { de_mirage: ctx } });
  check("partial rival roster still splits sides", two.maps[0].t.rounds === 12 && two.maps[0].ct.rounds === 12);
  const empty = analyzeRival({ rival: THEM, matches: [], maps: {} });
  check("no matches: empty report", empty.matches.length === 0 && empty.maps.length === 0 && empty.insights.length === 0);
  // No frames at all (old matches): rounds still count from the stored scores, no positions.
  const noFrames = analyzeRival({ rival: THEM, matches: [{ ...match, rounds: match.rounds.map((r) => ({ ...r, frames: [] })) }], maps: { de_mirage: ctx } });
  check("rounds without frames: sides from scores, plants still give sites", noFrames.maps[0].t.rounds === 12 && noFrames.maps[0].t.sites.B === 8 && noFrames.maps[0].ct.setups.length === 0);
}

// ─── 4. Board data ───────────────────────────────────────
{
  const board = emptyBoard();
  check("empty board: 5 CT + 5 T tokens", board.steps[0].items.filter((i) => i.kind === "player").length === 10);
  check("empty board is valid", parseBoardData(board) != null);
  check("coordinates outside the map are refused", parseBoardData({ v: 1, steps: [{ name: "1", items: [{ id: "a", kind: "util", type: "SMOKE", x: 1.2, y: 0.5 }] }] }) === null);
  check("unknown item kinds are refused", parseBoardData({ v: 1, steps: [{ name: "1", items: [{ id: "a", kind: "script", x: 0.1, y: 0.1 }] }] }) === null);
  check("too many steps are refused", parseBoardData({ v: 1, steps: Array.from({ length: MAX_STEPS + 1 }, () => ({ name: "x", items: [] })) }) === null);
  check("no steps is refused", parseBoardData({ v: 1, steps: [] }) === null);
  const big = {
    v: 1,
    steps: Array.from({ length: MAX_STEPS }, (_, s) => ({
      name: String(s),
      items: Array.from({ length: 6 }, (_, i) => ({ id: `l${s}_${i}`, kind: "line", color: "lime", points: Array.from({ length: MAX_POINTS }, (_, k) => [k / MAX_POINTS, 0.123456]) })),
    })),
  };
  check("boards over the size limit are refused", JSON.stringify(big).length > MAX_BOARD_BYTES && parseBoardData(big) === null);

  const mirage = getMapConfig("de_mirage")!;
  const p = worldToBoard(mirage, -300, -1000);
  const c = makeWorldToCanvas(mirage, 1024)(-300, -1000);
  check("world → board matches the radar transform", near(p.x, Math.round((c.x / 1024) * 10000) / 10000) && near(p.y, Math.round((c.y / 1024) * 10000) / 10000));
  const fromRival = boardFromTokens(mirage, "CT", [{ name: "rival_awp", x: -300, y: -1000 }, { name: "x", x: 99999, y: 99999 }]);
  const rivalTokens = fromRival.steps[0].items.filter((i) => i.kind === "player" && i.side === "CT");
  check("board from a rival: their tokens on their side, ours on the other", rivalTokens.length === 2 && fromRival.steps[0].items.filter((i) => i.kind === "player" && i.side === "T").length === 5);
  check("off-map rival positions are clamped onto the map", parseBoardData(fromRival) != null);

  const stroke = Array.from({ length: 1000 }, (_, i) => [i / 1000, Math.sin(i / 50) / 4 + 0.5] as [number, number]);
  const simple = simplifyStroke(stroke);
  check("strokes are thinned to the point limit, ends kept", simple.length <= MAX_POINTS && simple.length >= 2 && near(simple[0][0], 0) && near(simple[simple.length - 1][0], 0.999));

  const withDrawing = { ...board.steps[0], items: [...board.steps[0].items, { id: "d1", kind: "line" as const, color: "lime" as const, points: [[0.1, 0.1], [0.2, 0.2]] as Array<[number, number]> }] };
  const next = nextStep(withDrawing, "2");
  check("next step keeps players, drops drawings", next.items.length === 10 && !next.items.some((i) => i.kind === "line"));
  check("new item ids are unique", !board.steps[0].items.some((i) => i.id === newItemId(board.steps[0].items.map((x) => x.id))));

  const moved = moveBoardItem({ id: "p", kind: "player", side: "CT", label: "1", x: 0.95, y: 0.5 }, 0.2, 0);
  check("moving clamps to the map", moved.kind === "player" && moved.x === 1);
  const mid = interpolateItems([{ id: "p", kind: "player", side: "CT", label: "1", x: 0, y: 0 }], [{ id: "p", kind: "player", side: "CT", label: "1", x: 1, y: 1 }], 0.5);
  check("step playback moves tokens between steps", mid[0].kind === "player" && near(mid[0].x, 0.5));
  const hit = hitBoardItem(
    [{ id: "l", kind: "arrow", color: "lime", points: [[0.1, 0.1], [0.5, 0.1]] }, { id: "p", kind: "player", side: "T", label: "1", x: 0.3, y: 0.1 }],
    0.3,
    0.105,
    0.02,
    1 / 5120
  );
  check("tap picks the player above the arrow", hit?.id === "p");
}

// ─── 5. Copy and navigation ──────────────────────────────
{
  const keys: Insight["key"][] = ["tSite", "tFast", "tLate", "tExecute", "ctSetup", "ctStack", "ctAggro", "retakeWeak", "retakeStrong", "forceAfterPistol", "ecoAfterPistol", "pistolSite", "anchor", "awp", "lurk", "entry"];
  const missing = keys.filter((k) => !pl.antistrat.insight[k] || !en.antistrat.insight[k]);
  check(`every insight has PL and EN copy${missing.length ? `: ${missing.join(", ")}` : ""}`, missing.length === 0);
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const differ = keys.filter((k) => placeholders(pl.antistrat.insight[k]) !== placeholders(en.antistrat.insight[k]));
  check(`PL and EN insights use the same numbers${differ.length ? `: ${differ.join(", ")}` : ""}`, differ.length === 0);
  const team = navGroups.flatMap((g) => g.items).find((i) => i.href === "/team");
  check("Drużyna is in the menu and no longer 'soon'", !!team && !team.soon);
}

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exit(1);
