/**
 * Regression test for role detection and "play like a pro" (S24).
 * Run: npm run test:roles
 *
 * 1. a synthetic 16-round match: entry, lurk, AWP and support on T, anchors,
 *    AWP and support on CT, both teams, sides swapped at halftime,
 * 2. the match role from the side roles,
 * 3. role thresholds inside one team (assignTeamRoles),
 * 4. norm samples carry the roles and profiles; pro samples feed "pro/<role>",
 * 5. role norms, role comparisons and advice, profile medians, callouts,
 * 6. every role has PL/EN name, description, tips and advice per key metric,
 * 7. S31: bombsite zones, positions per round (callout, path, isolation,
 *    rotation), activity, the CT roles rotator and mid, and roles corrected
 *    by hand (per match, usual role, detected).
 *
 * No demo file or database required — everything here is pure.
 */
import type { TacticsFrame, TacticsInput, TacticsKill, TacticsRound } from "@/lib/analysis/tactics";
import { buildNormSamples } from "@/lib/norms/build";
import { aggregateNorms, isRolePool, METRIC_DIRECTION, NormTable, rolePool, roleNorm, type NormSampleInput } from "@/lib/norms/norms";
import { anchorSite, assignTeamRoles, detectRoles, matchRole, ROLES, SIDE_ROLES, type Role, type SideProfile } from "@/lib/roles/roles";
import { mergeSites, siteCentresFromCells, siteCentresFromPlants, siteOfPlace, zoneOf } from "@/lib/analysis/sites";
import {
  asRoleDefaults,
  effectiveRoles,
  isSideRole,
  MAX_ROLE_DEFAULTS,
  resolve,
  roleOfRound,
  updateRoleDefaults,
} from "@/lib/roles/effective";
import {
  asProfile,
  compareRoleMetrics,
  medianProfile,
  profileValues,
  PROFILE_FIELDS,
  ROLE_METRICS,
  ROLE_TIP_COUNT,
  roleAdvice,
  roleCounts,
  spotPlaces,
  activityNoteKey,
  activityOf,
  sidePositions,
} from "@/lib/roles/view";
import { pl } from "@/lib/i18n/messages/pl";
import { en } from "@/lib/i18n/messages/en";

const checks: [string, boolean][] = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// ─── 1. Synthetic match ──────────────────────────────────

const TICK = 64;
type Side = "CT" | "T";
const A = ["a1", "a2", "a3", "a4", "a5"]; // finishes on CT → T in rounds 1–12
const B = ["b1", "b2", "b3", "b4", "b5"];
const ROUNDS = 16;
const sideOfTeam = (team: "A" | "B", round: number): Side => (round <= 12 ? (team === "A" ? "T" : "CT") : team === "A" ? "CT" : "T");

// Positions by index in the team, per side.
const T_POS = [
  [500, 500],
  [-2600, 2600],
  [450, 450],
  [400, 500],
  [500, 400],
];
const CT_POS = [
  [1000, 1000], // site A
  [-1000, -1000], // site B
  [0, 0],
  [60, 0],
  [0, 60],
];

const rounds: TacticsRound[] = [];
const kills: TacticsKill[] = [];
const damages: TacticsInput["damages"] = [];
const bombs: TacticsInput["bombs"] = [];
for (let n = 1; n <= ROUNDS; n++) {
  const start = n * 10000;
  const freezeEnd = start + 15 * TICK;
  const end = start + 70 * TICK;
  const tTeam = sideOfTeam("A", n) === "T" ? A : B;
  const ctTeam = tTeam === A ? B : A;
  const k = (s: number) => freezeEnd + s * TICK;
  const kill = (attacker: string, victim: string, tick: number, weapon: string) =>
    kills.push({
      tick, roundNumber: n, attackerSteamId: attacker, victimSteamId: victim, weapon,
      attackerPosX: 0, attackerPosY: 0, attackerPosZ: 0, victimPosX: 0, victimPosY: 0, victimPosZ: 0,
    });
  damages.push({ tick: k(10), roundNumber: n, attackerSteamId: tTeam[0], victimSteamId: ctTeam[2] });
  kill(tTeam[4], ctTeam[3], k(12), "awp");
  kill(ctTeam[2], tTeam[2], k(13), "awp");
  kill(tTeam[0], ctTeam[4], k(14), "ak47");
  if (n % 4 === 0) bombs.push({ tick: k(30), roundNumber: n, type: "PLANTED", playerSteamId: tTeam[0], posX: 1000, posY: 1000, posZ: 0, site: "A" });
  if (n % 4 === 2) bombs.push({ tick: k(30), roundNumber: n, type: "PLANTED", playerSteamId: tTeam[0], posX: -1000, posY: -1000, posZ: 0, site: "B" });

  const deathAt = new Map(kills.filter((x) => x.roundNumber === n).map((x) => [x.victimSteamId, x.tick]));
  const frames: TacticsFrame[] = [];
  for (let tick = start; tick <= end; tick += 32) {
    const moving = tick >= freezeEnd;
    frames.push({
      tick,
      players: [
        ...tTeam.map((id, i) => ({ id, side: "T" as Side, pos: T_POS[i] })),
        ...ctTeam.map((id, i) => ({ id, side: "CT" as Side, pos: CT_POS[i] })),
      ].map(({ id, side, pos }) => ({
        steamId: id, team: side, x: pos[0], y: pos[1], z: 0,
        velX: moving ? 100 : 0, velY: 0, isAlive: (deathAt.get(id) ?? Infinity) > tick,
      })),
    });
  }
  rounds.push({ number: n, startTick: start, endTick: end, winner: "T", winReason: "ELIMINATION", ctScore: 0, tScore: n, frames });
}

const tactics: TacticsInput = {
  tickRate: TICK,
  rounds,
  kills,
  damages,
  bombs,
  economy: [],
  players: [...A.map((id) => ({ steamId: id, name: id, team: "CT" as Side })), ...B.map((id) => ({ steamId: id, name: id, team: "T" as Side }))],
};

const roles = new Map(detectRoles(tactics).map((r) => [r.steamId, r]));
const sideRole = (id: string, side: Side) => roles.get(id)?.sides[side]?.role ?? null;

check("entry on T: first of the team into contact", sideRole("a1", "T") === "entry" && sideRole("b1", "T") === "entry");
check("lurk on T: far from the team", sideRole("a2", "T") === "lurk" && sideRole("b2", "T") === "lurk");
check("AWP on T: most kills with the AWP", sideRole("a5", "T") === "awp" && sideRole("b5", "T") === "awp");
check("the rest of T is support", sideRole("a3", "T") === "support" && sideRole("a4", "T") === "support");
check("anchors on CT: set up on the bombsites", sideRole("b1", "CT") === "anchor" && sideRole("b2", "CT") === "anchor");
check("AWP on CT", sideRole("b3", "CT") === "awp" && sideRole("a3", "CT") === "awp");
check("mid CTs are support", sideRole("b4", "CT") === "support" && sideRole("b5", "CT") === "support");
check("sides swap at halftime (A was T in 12 rounds)", roles.get("a1")?.sides.T?.profile.rounds === 12 && roles.get("a1")?.sides.CT?.profile.rounds === 4);

const a1T = roles.get("a1")!.sides.T!.profile;
check("entry's first contact 10 s after freeze end", a1T.contactTimeS === 10 && a1T.firstContacts === 12);
check("setup spots: one per round, on the grid", a1T.spotRounds === 12 && a1T.spots.length === 12 && a1T.spots[0][0] === 496);
check("lurk spacing is measured", (roles.get("a2")!.sides.T!.profile.teamDistance ?? 0) > 3000);
check("victim's death time", roles.get("a3")!.sides.T!.profile.deathTimeS === 13);
check("AWP kills counted", roles.get("a5")!.sides.T!.profile.awpKills === 12 && roles.get("a5")!.sides.T!.profile.kills === 12);
check("anchors' site rounds from the plants", roles.get("b1")!.sides.CT!.profile.siteRounds === 12);

// Callouts take priority over plant centres for "on a site".
const named = detectRoles(
  { ...tactics, bombs: [] },
  { placeOf: (p) => (p.x === 0 && p.y === 0 ? "BombsiteA" : "Mid") }
);
const namedRole = (id: string) => named.find((r) => r.steamId === id)?.sides.CT?.role;
check("callout 'Bombsite' marks the anchor without plants", namedRole("b3") === "awp" && namedRole("b4") === "support");
check("a mid callout makes the CT a mid player (S31)", namedRole("b1") === "mid");

// ─── 2. Match role ───────────────────────────────────────

check("match role: entry", roles.get("a1")?.role === "entry");
check("match role: lurk beats CT anchor", roles.get("a2")?.role === "lurk");
check("match role: AWP on either side wins", roles.get("a3")?.role === "awp" && roles.get("a5")?.role === "awp");
check("match role: anchor when T is support", matchRole({ T: { role: "support", profile: a1T }, CT: { role: "anchor", profile: a1T } }) === "anchor");
check("match role: support", roles.get("a4")?.role === "support");
check("match role: null without sides", matchRole({}) === null);

// ─── 3. Thresholds inside one team ───────────────────────

const prof = (p: Partial<SideProfile>): SideProfile => ({
  side: "T", rounds: 12, kills: 10, awpKills: 0, firstContacts: 0, contactTimeS: 20, deathTimeS: 30,
  teamDistance: 500, spotRounds: 10, siteRounds: 0, spots: [], ...p,
});
const team = assignTeamRoles("T", [
  { id: "x1", prof: prof({ awpKills: 2, kills: 3 }) },
  { id: "x2", prof: prof({ firstContacts: 2 }) },
  { id: "x3", prof: prof({ teamDistance: 1100 }) },
]);
check("no AWPer below the kill minimum", team.get("x1") === "support");
check("no entry below the contact share", team.get("x2") === "support");
check("no lurk below the distance", team.get("x3") === "support");
const ct = assignTeamRoles("CT", [
  { id: "y1", prof: prof({ side: "CT", siteRounds: 5, spotRounds: 10 }) },
  { id: "y2", prof: prof({ side: "CT", siteRounds: 4, spotRounds: 10 }) },
  { id: "y3", prof: prof({ side: "CT", awpKills: 6, kills: 8, siteRounds: 10 }) },
]);
check("anchor at half of the rounds on site", ct.get("y1") === "anchor" && ct.get("y2") === "support");
check("AWP before anchor", ct.get("y3") === "awp");
const twoAwps = assignTeamRoles("T", [
  { id: "z1", prof: prof({ awpKills: 4, kills: 10 }) },
  { id: "z2", prof: prof({ awpKills: 6, kills: 8 }) },
]);
check("one AWPer per team: the higher share", twoAwps.get("z2") === "awp" && twoAwps.get("z1") === "support");

// ─── 4. Norm samples ─────────────────────────────────────

const built = buildNormSamples({
  map: "de_mirage",
  pro: true,
  players: tactics.players.map((p) => ({ steamId: p.steamId, team: p.team, rank: null })),
  mechanics: null,
  aim: null,
  tactics,
  utility: null,
});
const sample = (id: string, side: string) => built.find((s) => s.steamId === id && s.side === side);
check("'all' sample carries the match role, no profile", sample("a1", "all")?.role === "entry" && sample("a1", "all")?.profile === null);
check("side samples carry the side role and profile", sample("a1", "T")?.role === "entry" && sample("a1", "CT")?.role === "anchor" && sample("a1", "T")?.profile?.rounds === 12);
check("stored profile reads back", asProfile(JSON.parse(JSON.stringify(sample("a1", "T")!.profile))) !== null && asProfile({ side: "X" }) === null);

const pool: NormSampleInput[] = [];
for (let i = 0; i < 10; i++) {
  pool.push({ map: "de_mirage", side: "all", pro: true, rank: null, role: "entry", metrics: { "opening@all": [60 + i, 20] } });
  pool.push({ map: "de_mirage", side: "all", pro: true, rank: null, role: "support", metrics: { "opening@all": [30 + i, 20] } });
  pool.push({ map: "de_mirage", side: "all", pro: false, rank: null, role: "entry", metrics: { "opening@all": [40, 20] } });
}
const rows = aggregateNorms(pool);
const cell = (p: string) => rows.find((r) => r.pool === p && r.map === "de_mirage" && r.metric === "opening");
check("pro samples feed the role pool", cell(rolePool("entry"))?.n === 10 && cell(rolePool("entry"))?.p50 === 64.5);
check("…and still the whole pro pool", cell("pro")?.n === 20);
check("players' roles make no role pool", !rows.some((r) => r.pool === "all/entry") && cell("all")?.n === 10);
check("role pools are recognisable", isRolePool(rolePool("awp")) && !isRolePool("pro") && !isRolePool("faceit:7"));

// ─── 5. Role norms and comparisons ───────────────────────

const table = new NormTable(rows);
check("roleNorm reads the role pool", roleNorm(table, "entry", "opening", { map: "de_mirage" })?.p50 === 64.5);
check("roleNorm is null without samples", roleNorm(table, "lurk", "opening", { map: "de_mirage" }) === null);
const cmps = compareRoleMetrics("entry", { "opening@all": [40, 20], "traded_deaths@all": [10, 20] }, table, { map: "de_mirage" });
const opening = cmps.find((c) => c.metric === "opening")!;
check("comparison uses the role norm and its verdict", opening.roleSpecific && opening.verdict === "worse" && opening.value === 40);
const traded = cmps.find((c) => c.metric === "traded_deaths")!;
check("falls back to every pro (reference) without role samples", !traded.roleSpecific && traded.norm?.source === "reference");
check("advice lists the worse metrics, role order kept", roleAdvice(cmps).map((c) => c.metric)[0] === "opening");
const median = compareRoleMetrics("entry", { "opening@all": { value: 70 } }, table, { map: "de_mirage" }).find((c) => c.metric === "opening")!;
check("medians compare too", median.value === 70 && median.verdict === "better");

const values = profileValues(a1T);
check("profile values: first contact share and AWP share", values.firstContact === 100 && values.awpShare === 0);
const med = medianProfile([prof({ contactTimeS: 10 }), prof({ contactTimeS: 20 }), prof({ contactTimeS: null })]);
check("profile median skips missing values", med.contactTime === 15 && med.teamDistance === 500);
check("profile median of nothing is empty", medianProfile([]).deathTime === null);
const spots = spotPlaces(
  [[0, 0, 0], [0, 0, 0], [10, 10, 0], [5000, 0, 0]],
  (p) => (p.x > 1000 ? null : p.x === 0 ? "Jungle" : "Connector")
);
check("callouts by share", spots[0].place === "Jungle" && spots[0].share === 50 && spots.length === 2);
check("no callouts without a lookup", spotPlaces([[0, 0, 0]], null).length === 0);
check("role counts, most common first", roleCounts(["entry", null, "awp", "entry"])[0].role === "entry" && roleCounts([]).length === 0);

// ─── 6. Copy and catalog ─────────────────────────────────

check("every role metric has a direction", ROLES.every((r) => ROLE_METRICS[r].every((m) => m.metric in METRIC_DIRECTION)));
const has = (dict: typeof pl | typeof en, role: Role) => {
  const r = dict.roles as unknown as {
    name: Record<string, string>;
    desc: Record<string, string>;
    tip: Record<string, Record<string, string>>;
    advice: Record<string, Record<string, string>>;
  };
  return (
    !!r.name[role] &&
    !!r.desc[role] &&
    Array.from({ length: ROLE_TIP_COUNT }, (_, i) => r.tip[role]?.[String(i + 1)]).every(Boolean) &&
    ROLE_METRICS[role].every((m) => !!r.advice[role]?.[m.metric])
  );
};
check("PL: name, description, tips and advice per role metric", ROLES.every((r) => has(pl, r)));
check("EN: name, description, tips and advice per role metric", ROLES.every((r) => has(en, r)));
check("PL/EN label per profile value", PROFILE_FIELDS.every((f) => f.key in pl.roles.profile && f.key in en.roles.profile));

// ─── 7. Positions, activity, rotator / mid, corrections (S31) ──

check("site letter from a callout", siteOfPlace("BombsiteB") === "B" && siteOfPlace("Bombsite A") === "A" && siteOfPlace("Mid") === null);
const cellSites = siteCentresFromCells([
  { cx: 10, cy: 10, cz: 0, place: "BombsiteA", count: 3 },
  { cx: 12, cy: 10, cz: 0, place: "BombsiteA", count: 1 },
  { cx: -10, cy: -10, cz: 0, place: "BombsiteB", count: 2 },
  { cx: 0, cy: 0, cz: 0, place: "TopofMid", count: 9 },
]);
check("site centres from callout cells (sample-weighted)", Math.round(cellSites.A!.x) === 1408 && Math.round(cellSites.B!.x) === -1216);
const plantSites = siteCentresFromPlants(tactics.bombs);
check("site centres from plants", plantSites.A?.x === 1000 && plantSites.B?.y === -1000);
check("callouts win over plants", mergeSites(cellSites, plantSites).A === cellSites.A && mergeSites({}, plantSites).B === plantSites.B);
const S = { A: { x: 1000, y: 1000, z: 0 }, B: { x: -1000, y: -1000, z: 0 } };
check("zone: on a site", zoneOf({ x: 900, y: 1100, z: 0 }, null, S) === "A" && zoneOf({ x: -1100, y: -900, z: 0 }, null, S) === "B");
check("zone: between the sites is mid", zoneOf({ x: 60, y: 0, z: 0 }, null, S) === "mid");
check("zone: a bombsite callout decides", zoneOf({ x: 0, y: 0, z: 0 }, "BombsiteB", S) === "B");
check("zone: unknown without sites", zoneOf({ x: 0, y: 0, z: 0 }, null, {}) === null);
check("zone: one known site tells only that site", zoneOf({ x: 900, y: 900, z: 0 }, null, { A: S.A }) === "A" && zoneOf({ x: -900, y: -900, z: 0 }, null, { A: S.A }) === null);

const posRoles = new Map(detectRoles(tactics, { sites: S, placeOf: (p) => (p.x > 500 ? "BombsiteA" : p.x < -500 ? "BombsiteB" : "TopofMid") }).map((r) => [r.steamId, r]));
const b1CT = posRoles.get("b1")!.sides.CT!.profile;
check("one round spot per round with a spot", b1CT.roundSpots?.length === 12 && b1CT.roundSpots[0].round === 1);
check("round spot: callout and zone", b1CT.roundSpots?.every((r) => r.place === "BombsiteA" && r.zone === "A") === true);
check("round spot: the path keeps the callout once", b1CT.roundSpots?.[0].path.join() === "BombsiteA");
check("A anchor is isolated (nearest alive CT 1400+ away)", b1CT.isolatedRounds === 12 && b1CT.roundSpots?.[0].isolated === true);
check("zones counted", b1CT.zones?.A === 12 && b1CT.zones?.B === 0 && anchorSite(b1CT) === "A" && anchorSite(posRoles.get("b2")!.sides.CT!.profile) === "B");
check("no rotations when standing still", b1CT.rotations === 0);
const a1Tp = posRoles.get("a1")!.sides.T!.profile;
check("activity: contact rounds", a1Tp.contactRounds === 12);
const act = activityOf(a1Tp)!;
check("activity: tempo, first contacts, involvement, quiet rounds", act.tempoS === 10 && act.firstContactShare === 100 && act.contactShare === 100 && act.quietShare === 0);
check("no activity for profiles stored before S31", activityOf({ ...a1Tp, contactRounds: undefined }) === null);
const pos = sidePositions(b1CT)!;
check("positions: top callouts, zone shares, isolation", pos.top[0].place === "BombsiteA" && pos.top[0].share === 100 && pos.zones?.A === 100 && pos.isolatedShare === 100 && pos.site === "A");
check("no positions for profiles stored before S31", sidePositions({ ...b1CT, roundSpots: undefined }) === null);
check("lone anchor: quiet rounds are the job", activityNoteKey("anchor", pos) === "roles.activity.note.anchorIsolated" &&
  activityNoteKey("anchor", { ...pos, isolatedShare: 20 }) === "roles.activity.note.anchor" && activityNoteKey("entry", null) === "roles.activity.note.entry");

// A CT who walks from A to B every round: rotation and the path.
{
  const ids = ["c1", "c2", "c3", "c4", "c5", "t1", "t2", "t3", "t4", "t5"];
  const rr: typeof rounds = [];
  for (let n = 1; n <= 4; n++) {
    const fr: TacticsFrame[] = [];
    for (let tick = 0; tick <= 60 * TICK; tick += 32) {
      const s = tick / TICK;
      fr.push({
        tick,
        players: ids.map((id, i) => {
          const ct = id.startsWith("c");
          // c1: A until 40 s (setup spot at 35 s), mid until 44 s, then B.
          const x = id === "c1" ? (s < 40 ? 1000 : s < 44 ? 0 : -1000) : ct ? 200 * i : 3000;
          const y = id === "c1" ? (s < 40 ? 1000 : s < 44 ? 0 : -1000) : ct ? 0 : 3000;
          return { steamId: id, team: ct ? ("CT" as Side) : ("T" as Side), x, y, z: 0, velX: s >= 15 ? 100 : 0, velY: 0, isAlive: true };
        }),
      });
    }
    rr.push({ number: n, startTick: 0, endTick: 60 * TICK, winner: "CT", winReason: "TIME_RAN_OUT", ctScore: n, tScore: 0, frames: fr });
  }
  const rot = detectRoles(
    { tickRate: TICK, rounds: rr, kills: [], damages: [], bombs: [], economy: [], players: ids.map((id) => ({ steamId: id, name: id, team: id.startsWith("c") ? ("CT" as Side) : ("T" as Side) })) },
    { sites: S, placeOf: (p) => (p.x > 500 ? "BombsiteA" : p.x < -500 ? "BombsiteB" : "Connector") }
  );
  const c1 = rot.find((r) => r.steamId === "c1")!.sides.CT!.profile;
  check("rotation: from A to B while alive", c1.rotations === 4 && c1.roundSpots?.every((r) => r.rotated) === true);
  check("rotation: the path of callouts", c1.roundSpots?.[0].path.join(" → ") === "BombsiteA → Connector → BombsiteB");
  check("quiet rounds: no fight", c1.contactRounds === 0 && c1.roundSpots?.[0].contact === false && c1.roundSpots?.[0].diedS === null);
}

const ctProf = (p: Partial<SideProfile>) => prof({ side: "CT", spotRounds: 10, siteRounds: 0, zones: { A: 0, B: 0, mid: 0 }, midRounds: 0, rotations: 0, ...p });
const ctRoles = assignTeamRoles("CT", [
  { id: "m1", prof: ctProf({ midRounds: 6, zones: { A: 0, B: 0, mid: 6 } }) },
  { id: "r1", prof: ctProf({ zones: { A: 2, B: 2, mid: 6 } }) },
  { id: "r2", prof: ctProf({ siteRounds: 4, rotations: 3, zones: { A: 4, B: 3, mid: 3 } }) },
  { id: "s1", prof: ctProf({ siteRounds: 4, rotations: 1, zones: { A: 4, B: 0, mid: 0 } }) },
  { id: "k1", prof: ctProf({ siteRounds: 6, midRounds: 6 }) },
]);
check("CT mid: set up on a mid callout", ctRoles.get("m1") === "mid");
check("CT rotator: set up between the sites", ctRoles.get("r1") === "rotator");
check("CT rotator: moved to the other site often", ctRoles.get("r2") === "rotator");
check("CT support otherwise, anchor first", ctRoles.get("s1") === "support" && ctRoles.get("k1") === "anchor");
check("match role: rotator / mid from the CT side", matchRole({ T: { role: "support" }, CT: { role: "rotator" } }) === "rotator" &&
  matchRole({ T: { role: "entry" }, CT: { role: "mid" } }) === "entry");
check("side roles: entry/lurk only T, anchor/rotator/mid only CT, AWP both",
  SIDE_ROLES.T.includes("entry") && !SIDE_ROLES.CT.includes("entry") && SIDE_ROLES.CT.includes("mid") && SIDE_ROLES.T.includes("awp") && SIDE_ROLES.CT.includes("awp"));
check("isSideRole", isSideRole("CT", "anchor") && !isSideRole("T", "anchor") && !isSideRole("T", "ninja"));

// Corrections: the match's own > the usual role > detected.
const det = { T: "support" as Role, CT: "anchor" as Role };
const none = resolve("p1", det, [], null);
check("no correction → detected", none.sides.T === "support" && none.source.T === null && none.role === "anchor");
const usual = resolve("p1", det, [], { p1: { T: "entry" } });
check("usual role applies to that SteamID", usual.sides.T === "entry" && usual.source.T === "default" && usual.role === "entry" && usual.sides.CT === "anchor");
check("usual role of another SteamID is ignored", resolve("p2", det, [], { p1: { T: "entry" } }).sides.T === "support");
const own = resolve("p1", det, [{ steamId: "p1", side: "T", role: "lurk" }], { p1: { T: "entry" } });
check("the match's own correction wins", own.sides.T === "lurk" && own.source.T === "match" && own.detected.T === "support");
check("a correction invalid for the side is ignored", resolve("p1", det, [{ steamId: "p1", side: "CT", role: "entry" }], null).sides.CT === "anchor");
check("usual roles: parse drops junk", asRoleDefaults({ "761": { T: "anchor", CT: "mid" } })?.["761"]?.CT === "mid" &&
  asRoleDefaults({ "761": { T: "anchor" } }) === null && asRoleDefaults({ x: { T: "entry" } }) === null && asRoleDefaults("x") === null &&
  asRoleDefaults([]) === null);
const two = updateRoleDefaults(updateRoleDefaults(null, "761", "T", "entry"), "762", "CT", "awp");
check("usual roles: several players, set and clear", two?.["761"]?.T === "entry" && two?.["762"]?.CT === "awp" &&
  updateRoleDefaults({ "761": { T: "entry" } }, "761", "T", null) === null);
let many: ReturnType<typeof updateRoleDefaults> = null;
for (let i = 0; i < MAX_ROLE_DEFAULTS + 5; i++) many = updateRoleDefaults(many, String(1000 + i), "T", "entry");
check("usual roles: capped, oldest dropped", Object.keys(many ?? {}).length === MAX_ROLE_DEFAULTS && !("1000" in (many ?? {})) && String(1000 + MAX_ROLE_DEFAULTS + 4) in (many ?? {}));
const eff = effectiveRoles(detectRoles(tactics), [{ steamId: "a4", side: "T", role: "lurk" }], null);
const roleOf = roleOfRound(tactics, eff);
check("round role follows the side of the round", roleOf("a1", 1) === "entry" && roleOf("a1", 14) === "anchor");
check("round role uses the correction", roleOf("a4", 2) === "lurk" && roleOf("a4", 14) === eff.get("a4")!.detected.CT);

const r = pl.roles as unknown as { activity: { note: Record<string, string> }; correct: Record<string, string> };
const e = en.roles as unknown as typeof r;
check("PL/EN activity note for every role and the lone anchor",
  [...ROLES, "anchorIsolated"].every((k) => !!r.activity.note[k] && !!e.activity.note[k]));
check("PL/EN correction copy in step", Object.keys(r.correct).every((k) => !!e.correct[k]));

// ─── Report ──────────────────────────────────────────────

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
if (failed > 0) process.exit(1);
