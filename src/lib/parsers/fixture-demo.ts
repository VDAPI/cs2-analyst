/**
 * Fixture demos for the E2E tests (S19).
 *
 * A real CS2 .dem is 50–300 MB and cannot live in the repo, so the E2E suite
 * uploads a tiny JSON file with a `.dem` name instead, and this module plays
 * the part of @laihoe/demoparser2 for it: a deterministic simulation of a
 * whole match on de_mirage (10 players walking real routes, buys, duels with
 * shots and damage, grenades, flashes, plants, defuses, halftime) answered
 * through the same four calls the pipeline makes (parseHeader,
 * parsePlayerInfo, parseEvent, parseTicks), with the same field names.
 *
 * Everything after the parser is the real code: demo-parser.ts, the replay
 * blob encoder, mechanics/aim/utility/tactics analysis, findings, norms.
 *
 * Only used when E2E_FIXTURE_DEMOS=1 (see load-parser.ts). A file that is not
 * a fixture throws, like the real parser does on a broken demo, so the E2E
 * suite can test the "analysis failed" path too.
 */
import { readFileSync, statSync } from "node:fs";

export const FIXTURE_MAGIC = "cs2-analyst-e2e-fixture-demo";

/** Who won a round and how. */
export type FixtureOutcome = "T:elim" | "T:bomb" | "CT:elim" | "CT:defuse" | "CT:time";

export interface FixtureSpec {
  magic: typeof FIXTURE_MAGIC;
  seed: number;
  /** Outcome per round. Team A plays T in rounds 1–12 and CT after. */
  rounds: FixtureOutcome[];
  /** "account": team A is the E2E account's team (fixed SteamIDs); "other": fresh SteamIDs (e.g. pro demos). */
  teamA?: "account" | "other";
}

/** Team A player 1: the E2E account's own SteamID. */
export const FIXTURE_PLAYER_STEAM_ID = "76561198000000001";

/** 16 rounds, team A (the E2E account's team) wins 13–3. */
export const DEFAULT_FIXTURE_ROUNDS: FixtureOutcome[] = [
  "T:bomb", "T:elim", "CT:elim", "T:elim", "T:bomb", "CT:defuse",
  "T:elim", "T:elim", "CT:time", "T:elim", "T:bomb", "T:elim",
  "CT:elim", "CT:defuse", "CT:elim", "CT:elim",
];

/** JSON text of a fixture demo file. */
export function fixtureDemoText(
  seed: number,
  rounds: FixtureOutcome[] = DEFAULT_FIXTURE_ROUNDS,
  teamA: "account" | "other" = "account"
): string {
  const spec: FixtureSpec = { magic: FIXTURE_MAGIC, seed, rounds, teamA };
  return JSON.stringify(spec);
}

// ─── Parser API (the subset of @laihoe/demoparser2 the app calls) ──────

type Row = Record<string, unknown>;

export const fixtureParser = {
  parseHeader(path: string): Row {
    return load(path).header;
  },
  parsePlayerInfo(path: string): Row[] {
    return load(path).players.map((p) => ({ name: p.name, steamid: p.steamId, team_number: p.finalTeam }));
  },
  parseEvent(path: string, eventName: string): Row[] {
    return (load(path).events.get(eventName) ?? []).map((e) => ({ ...e }));
  },
  parseEvents(path: string, eventNames: string[]): Row[] {
    const events = load(path).events;
    return eventNames.flatMap((name) => (events.get(name) ?? []).map((e) => ({ ...e, event_name: name })));
  },
  parseTicks(path: string, props: string[], ticks?: number[] | null): Row[] {
    const sim = load(path);
    for (const p of props) {
      if (!TICK_PROPS.has(p)) throw new Error(`fixture demo: unknown prop ${p}`);
    }
    const out: Row[] = [];
    for (const tick of ticks ?? []) out.push(...sim.rowsAt(tick, props));
    return out;
  },
};

const TICK_PROPS = new Set([
  "X", "Y", "Z", "velocity_X", "velocity_Y", "velocity_Z", "pitch", "yaw", "health", "armor_value",
  "is_alive", "team_num", "active_weapon_name", "flash_duration", "active_weapon_ammo",
  "approximate_spotted_by", "current_equip_value", "balance", "last_place_name", "rank", "comp_rank_type",
  "team_rounds_total",
]);

const cache = new Map<string, Sim>();

function load(path: string): Sim {
  const key = `${path}|${statSync(path).mtimeMs}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let spec: FixtureSpec;
  try {
    spec = JSON.parse(readFileSync(path, "utf8")) as FixtureSpec;
  } catch {
    throw new Error("Demo file is corrupt or not a CS2 demo");
  }
  if (spec?.magic !== FIXTURE_MAGIC || !Array.isArray(spec.rounds) || spec.rounds.length === 0) {
    throw new Error("Demo file is corrupt or not a CS2 demo");
  }
  const sim = simulate(spec);
  if (cache.size > 4) cache.clear();
  cache.set(key, sim);
  return sim;
}

// ─── Simulation ──────────────────────────────────────────

const TICK_RATE = 64;
const REASON_CODE: Record<string, number> = {
  bomb_exploded: 1, bomb_defused: 7, t_killed: 8, ct_killed: 9, target_saved: 12,
};
/** demoparser2 gives the bomb site as the site trigger's entity index. */
const SITE_ENTITY = { A: 412, B: 413 } as const;
const FREEZE_TICKS = 10 * TICK_RATE;
const ROUND_GAP_TICKS = 5 * TICK_RATE;
const HALFTIME_GAP_TICKS = 12 * TICK_RATE;
const RUN_SPEED = 230 / TICK_RATE; // units per tick
const BOMB_TIMER_TICKS = 40 * TICK_RATE;
const SPOT_RANGE = 1500;

interface Pt { x: number; y: number }

/** de_mirage places (world units, read off the radar). */
const P = {
  tSpawn: { x: 1270, y: -110 },
  tRamp: { x: 700, y: -1500 },
  palace: { x: 450, y: -2150 },
  aSite: { x: -420, y: -2150 },
  ctSpawn: { x: -1630, y: -1840 },
  jungle: { x: -1080, y: -1450 },
  connector: { x: -1130, y: -1050 },
  mid: { x: -230, y: -640 },
  topMid: { x: 420, y: -320 },
  window: { x: -1150, y: -400 },
  market: { x: -2080, y: -480 },
  apartments: { x: -650, y: 620 },
  bApps: { x: -1350, y: 360 },
  bSite: { x: -2060, y: 260 },
} satisfies Record<string, Pt>;

const PLACE_NAMES: Array<[Pt, string]> = [
  [P.tSpawn, "TSpawn"], [P.tRamp, "TRamp"], [P.palace, "Palace"], [P.aSite, "BombsiteA"],
  [P.ctSpawn, "CTSpawn"], [P.jungle, "Jungle"], [P.connector, "Connector"], [P.mid, "Middle"],
  [P.topMid, "TopofMid"], [P.window, "SnipersNest"], [P.market, "Market"], [P.apartments, "Apartments"],
  [P.bApps, "BApartments"], [P.bSite, "BombsiteB"],
];

const T_ROUTES: Record<"A" | "B", Pt[][]> = {
  A: [
    [P.tSpawn, P.tRamp, P.aSite],
    [P.tSpawn, P.tRamp, P.palace, P.aSite],
    [P.tSpawn, P.palace, P.aSite],
    [P.tSpawn, P.topMid, P.mid, P.connector, P.aSite],
    [P.tSpawn, P.topMid, P.apartments, P.bApps],
  ],
  B: [
    [P.tSpawn, P.topMid, P.apartments, P.bApps, P.bSite],
    [P.tSpawn, P.topMid, P.apartments, P.bApps, P.bSite],
    [P.tSpawn, P.topMid, P.mid, P.window, P.bSite],
    [P.tSpawn, P.topMid, P.apartments, P.bSite],
    [P.tSpawn, P.tRamp, P.palace],
  ],
};

const CT_ROUTES: Pt[][] = [
  [P.ctSpawn, P.aSite],
  [P.ctSpawn, P.jungle, P.aSite],
  [P.ctSpawn, P.connector, P.mid],
  [P.ctSpawn, P.market, P.bSite],
  [P.ctSpawn, P.window, P.bSite],
];

interface SimPlayer {
  steamId: string;
  name: string;
  /** team_number at the end of the match: 3 = team A (CT in the second half). */
  finalTeam: 2 | 3;
  rating: number;
}

interface Loadout { display: string; code: string; clip: number }

const LOADOUTS = {
  tPistol: { display: "Glock-18", code: "glock", clip: 20 },
  ctPistol: { display: "USP-S", code: "usp_silencer", clip: 12 },
  deagle: { display: "Desert Eagle", code: "deagle", clip: 7 },
  galil: { display: "Galil AR", code: "galilar", clip: 35 },
  famas: { display: "FAMAS", code: "famas", clip: 25 },
  ak: { display: "AK-47", code: "ak47", clip: 30 },
  m4: { display: "M4A1-S", code: "m4a1_silencer", clip: 20 },
  awp: { display: "AWP", code: "awp", clip: 5 },
} satisfies Record<string, Loadout>;

interface DamageMark { tick: number; health: number; armor: number }

interface SimRound {
  number: number;
  startTick: number;
  freezeEndTick: number;
  endTick: number;
  /** team_num this round per player (2 = T, 3 = CT). */
  side: Map<string, 2 | 3>;
  route: Map<string, Pt[]>;
  routeLen: Map<string, number>;
  moveStart: Map<string, number>;
  hold: Map<string, number>;
  death: Map<string, number>;
  damage: Map<string, DamageMark[]>;
  blind: Map<string, Array<{ tick: number; duration: number }>>;
  shots: Map<string, number[]>;
  reloads: Map<string, number[]>;
  loadout: Map<string, Loadout>;
  armor: Map<string, number>;
  equip: Map<string, number>;
  balance: Map<string, number>;
  /** Who each player is aiming at while holding (for yaw). */
  target: Map<string, Array<{ from: number; at: string }>>;
}

interface Sim {
  header: Row;
  players: SimPlayer[];
  events: Map<string, Row[]>;
  rowsAt(tick: number, props: string[]): Row[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polylineLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

function pointAlong(pts: Pt[], d: number): { p: Pt; dir: Pt } {
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    const dir = seg > 0
      ? { x: (pts[i].x - pts[i - 1].x) / seg, y: (pts[i].y - pts[i - 1].y) / seg }
      : { x: 1, y: 0 };
    if (left <= seg || i === pts.length - 1) {
      const t = Math.min(left, seg);
      return { p: { x: pts[i - 1].x + dir.x * t, y: pts[i - 1].y + dir.y * t }, dir };
    }
    left -= seg;
  }
  return { p: pts[0], dir: { x: 1, y: 0 } };
}

function simulate(spec: FixtureSpec): Sim {
  const rand = mulberry32(spec.seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));

  const seedTag = String(spec.seed % 100).padStart(2, "0");
  const accountTeam = spec.teamA !== "other";
  const teamANames = accountTeam
    ? ["e2e_player", "kolega_b", "kolega_c", "kolega_d", "kolega_e"]
    : ["pro_a1", "pro_a2", "pro_a3", "pro_a4", "pro_a5"].map((n) => `${n}_${seedTag}`);
  const teamBNames = ["rywal_1", "rywal_2", "rywal_3", "rywal_4", "rywal_5"];
  const players: SimPlayer[] = [
    ...teamANames.map((name, i) => ({
      // Team A keeps the same SteamIDs in every fixture: it is "the account's team".
      steamId: accountTeam ? `7656119800000000${i + 1}` : `765611980000${seedTag}0${i + 1}`.padEnd(17, "0").slice(0, 17),
      name,
      finalTeam: 3 as const,
      rating: 14000 + i * 450,
    })),
    ...teamBNames.map((name, i) => ({
      steamId: `765611980000${seedTag}1${i + 1}`.padEnd(17, "0").slice(0, 17),
      name: spec.seed === 1 ? name : `${name}_${seedTag}`,
      finalTeam: 2 as const,
      rating: 13500 + i * 500,
    })),
  ];
  const byId = new Map(players.map((p) => [p.steamId, p]));

  const events = new Map<string, Row[]>();
  const emit = (name: string, row: Row) => {
    const list = events.get(name);
    if (list) list.push(row);
    else events.set(name, [row]);
  };

  const rounds: SimRound[] = [];
  const money = new Map(players.map((p) => [p.steamId, 800]));
  const lossStreak = { A: 0, B: 0 };
  let entityId = 1000;
  let tick = 64;
  emit("begin_new_match", { tick });
  tick += 64;

  const regulationHalf = 12;
  for (let i = 0; i < spec.rounds.length; i++) {
    const number = i + 1;
    const outcome = spec.rounds[i];
    const [winnerSide, how] = outcome.split(":") as ["T" | "CT", string];
    const secondHalf = number > regulationHalf;
    if (number === regulationHalf + 1) {
      for (const p of players) money.set(p.steamId, 800);
      lossStreak.A = 0;
      lossStreak.B = 0;
    }
    const pistol = number === 1 || number === regulationHalf + 1;
    // Team A is T in the first half.
    const sideOfTeam = (team: 2 | 3): 2 | 3 => (secondHalf ? team : team === 3 ? 2 : 3);

    const r: SimRound = {
      number,
      startTick: tick,
      freezeEndTick: tick + FREEZE_TICKS,
      endTick: 0,
      side: new Map(),
      route: new Map(),
      routeLen: new Map(),
      moveStart: new Map(),
      hold: new Map(),
      death: new Map(),
      damage: new Map(),
      blind: new Map(),
      shots: new Map(),
      reloads: new Map(),
      loadout: new Map(),
      armor: new Map(),
      equip: new Map(),
      balance: new Map(),
      target: new Map(),
    };
    emit("round_start", { tick: r.startTick });
    emit("round_freeze_end", { tick: r.freezeEndTick });

    const site: "A" | "B" = rand() < 0.55 ? "A" : "B";
    const ts = players.filter((p) => sideOfTeam(p.finalTeam) === 2);
    const cts = players.filter((p) => sideOfTeam(p.finalTeam) === 3);
    ts.forEach((p, idx) => r.route.set(p.steamId, T_ROUTES[site][idx]));
    cts.forEach((p, idx) => r.route.set(p.steamId, CT_ROUTES[idx]));

    // Buys.
    for (const p of players) {
      const side = sideOfTeam(p.finalTeam);
      r.side.set(p.steamId, side);
      r.routeLen.set(p.steamId, polylineLength(r.route.get(p.steamId)!));
      r.moveStart.set(p.steamId, r.freezeEndTick + int(0, 40));
      const cash = money.get(p.steamId)!;
      let loadout: Loadout;
      let spent: number;
      let armor = 0;
      const awper = p === (side === 3 ? cts[4] : ts[2]);
      if (pistol) {
        loadout = side === 2 ? LOADOUTS.tPistol : LOADOUTS.ctPistol;
        spent = rand() < 0.5 ? 650 : 200;
        armor = spent >= 650 ? 100 : 0;
      } else if (cash >= 4200) {
        loadout = awper && cash >= 5700 ? LOADOUTS.awp : side === 2 ? LOADOUTS.ak : LOADOUTS.m4;
        spent = (loadout === LOADOUTS.awp ? 4750 : side === 2 ? 2700 : 2900) + 1000 + 600;
        armor = 100;
      } else if (cash >= 2300 && rand() < 0.5) {
        loadout = side === 2 ? LOADOUTS.galil : LOADOUTS.famas;
        spent = Math.min(cash, 2100 + 650);
        armor = 100;
      } else {
        loadout = cash >= 900 && rand() < 0.4 ? LOADOUTS.deagle : side === 2 ? LOADOUTS.tPistol : LOADOUTS.ctPistol;
        spent = loadout === LOADOUTS.deagle ? 700 : 0;
      }
      spent = Math.min(spent, cash);
      r.loadout.set(p.steamId, loadout);
      r.armor.set(p.steamId, armor);
      r.equip.set(p.steamId, spent + 200);
      r.balance.set(p.steamId, cash - spent);
      money.set(p.steamId, cash - spent);
      r.damage.set(p.steamId, []);
      r.shots.set(p.steamId, []);
      r.reloads.set(p.steamId, []);
      r.blind.set(p.steamId, []);
      r.target.set(p.steamId, []);
    }

    const alive = (side: 2 | 3, at: number) =>
      players.filter((p) => r.side.get(p.steamId) === side && (r.death.get(p.steamId) ?? Infinity) > at);
    const posAt = (id: string, at: number) => position(r, id, at);

    // Grenades a few seconds into the round.
    for (const thrower of [...ts.slice(0, 3), ...cts.slice(0, 2)]) {
      const kinds = ["smoke", "flash", "he", "molotov"] as const;
      const kind = pick([...kinds]);
      const throwTick = r.freezeEndTick + int(6, 14) * TICK_RATE;
      const from = posAt(thrower.steamId, throwTick);
      const isT = r.side.get(thrower.steamId) === 2;
      const goal = isT ? (site === "A" ? P.aSite : P.bSite) : pick([P.mid, P.connector, P.bApps, P.tRamp]);
      const land = { x: goal.x + between(-180, 180), y: goal.y + between(-180, 180) };
      const yaw = (Math.atan2(land.y - from.p.y, land.x - from.p.x) * 180) / Math.PI;
      const weapon = { smoke: "weapon_smokegrenade", flash: "weapon_flashbang", he: "weapon_hegrenade", molotov: isT ? "weapon_molotov" : "weapon_incgrenade" }[kind];
      emit("weapon_fire", {
        tick: throwTick, user_steamid: thrower.steamId, user_name: thrower.name, weapon,
        user_X: from.p.x, user_Y: from.p.y, user_Z: 0, user_pitch: -12, user_yaw: yaw,
        user_velocity_X: 0, user_velocity_Y: 0, user_velocity_Z: 0,
      });
      const det = throwTick + (kind === "smoke" ? 110 : kind === "flash" ? 90 : 100);
      const atDet = posAt(thrower.steamId, det);
      const eid = entityId++;
      const base = {
        tick: det, user_steamid: thrower.steamId, user_name: thrower.name, entityid: eid,
        user_X: atDet.p.x, user_Y: atDet.p.y, user_Z: 0, x: land.x, y: land.y, z: 0,
      };
      if (kind === "smoke") emit("smokegrenade_detonate", base);
      if (kind === "molotov") {
        emit("inferno_startburn", base);
        emit("inferno_expire", { tick: det + 7 * TICK_RATE, entityid: eid, x: land.x, y: land.y, z: 0 });
        const burnTick = det + TICK_RATE;
        for (const victim of players) {
          if (r.side.get(victim.steamId) === r.side.get(thrower.steamId)) continue;
          if ((r.death.get(victim.steamId) ?? Infinity) <= burnTick) continue;
          const vp = posAt(victim.steamId, burnTick).p;
          if (dist(vp, land) > 450) continue;
          const hp = healthAt(r, victim.steamId, burnTick);
          const dmg = Math.min(hp - 1, int(8, 24));
          if (dmg <= 0) continue;
          r.damage.get(victim.steamId)!.push({ tick: burnTick, health: hp - dmg, armor: r.armor.get(victim.steamId)! });
          emit("player_hurt", hurtRow(burnTick, thrower, victim, "inferno", dmg, hp - dmg, r.armor.get(victim.steamId)!, "generic", posAt(thrower.steamId, burnTick).p, vp));
        }
      }
      if (kind === "flash") {
        emit("flashbang_detonate", base);
        for (const victim of players) {
          if ((r.death.get(victim.steamId) ?? Infinity) <= det) continue;
          const d = dist(posAt(victim.steamId, det).p, land);
          if (d > 700) continue;
          const duration = Math.round((3.2 - (d / 700) * 2.4) * 100) / 100;
          r.blind.get(victim.steamId)!.push({ tick: det, duration });
          emit("player_blind", {
            tick: det, user_steamid: victim.steamId, user_name: victim.name,
            attacker_steamid: thrower.steamId, attacker_name: thrower.name,
            blind_duration: duration, entityid: eid,
          });
        }
      }
      if (kind === "he") {
        emit("hegrenade_detonate", base);
        for (const victim of players) {
          if (r.side.get(victim.steamId) === r.side.get(thrower.steamId)) continue;
          const vp = posAt(victim.steamId, det).p;
          if (dist(vp, land) > 350) continue;
          const hp = healthAt(r, victim.steamId, det);
          const dmg = Math.min(hp - 1, int(8, 38));
          if (dmg <= 0) continue;
          r.damage.get(victim.steamId)!.push({ tick: det, health: hp - dmg, armor: r.armor.get(victim.steamId)! });
          emit("player_hurt", hurtRow(det, thrower, victim, "hegrenade", dmg, hp - dmg, r.armor.get(victim.steamId)!, "generic", atDet.p, vp));
        }
      }
    }

    // Duels.
    const winnerCode: 2 | 3 = winnerSide === "T" ? 2 : 3;
    const loserCode: 2 | 3 = winnerCode === 2 ? 3 : 2;
    let k = r.freezeEndTick + int(15, 19) * TICK_RATE;
    let plantTick: number | null = null;
    let planter: SimPlayer | null = null;
    let endTick = 0;
    let reason = "";
    const killsBeforePlant = how === "bomb" || how === "defuse" ? int(1, 2) : 99;
    let kills = 0;
    const maxKills = how === "time" ? 2 : 10;
    while (kills < maxKills) {
      const winners = alive(winnerCode, k);
      const losers = alive(loserCode, k);
      if (losers.length === 0 || winners.length === 0) break;
      if (how === "bomb" && plantTick !== null && alive(3, k).length <= int(0, 1)) break;
      // Plant once the Ts are on site.
      const tsAlive = alive(2, k);
      if ((how === "bomb" || how === "defuse") && plantTick === null && kills >= killsBeforePlant && tsAlive.length > 0) {
        const siteP = site === "A" ? P.aSite : P.bSite;
        planter = tsAlive.reduce((a, b) => (dist(posAt(a.steamId, k).p, siteP) <= dist(posAt(b.steamId, k).p, siteP) ? a : b));
        plantTick = k;
        r.hold.set(planter.steamId, Math.min(r.hold.get(planter.steamId) ?? Infinity, k - 3 * TICK_RATE));
        const pp = posAt(planter.steamId, k).p;
        emit("bomb_planted", { tick: k, user_steamid: planter.steamId, user_name: planter.name, user_X: pp.x, user_Y: pp.y, user_Z: 0, site: SITE_ENTITY[site], user_last_place_name: placeName(pp) });
        k += int(3, 6) * TICK_RATE;
        continue;
      }
      // Who wins this duel: mostly the round winner, never their last player.
      const winnerTakes = winners.length === 1 || rand() < 0.68;
      const victims = winnerTakes ? losers : winners;
      const killers = winnerTakes ? winners : losers;
      const victim = pick(victims);
      const vPos = posAt(victim.steamId, k).p;
      // One of the two enemies closest to the victim takes the duel.
      const nearest = [...killers].sort((a, b) => dist(posAt(a.steamId, k).p, vPos) - dist(posAt(b.steamId, k).p, vPos));
      const attacker = pick(nearest.slice(0, 2));
      // Most players stop to shoot (counter-strafe); some keep running.
      const stops = rand() < 0.65;
      if (stops) r.hold.set(attacker.steamId, Math.min(r.hold.get(attacker.steamId) ?? Infinity, k - 24));
      r.hold.set(victim.steamId, Math.min(r.hold.get(victim.steamId) ?? Infinity, k - int(40, 120)));
      r.target.get(attacker.steamId)!.push({ from: k - 90, at: victim.steamId });
      r.target.get(victim.steamId)!.push({ from: k - 90, at: attacker.steamId });
      duel(r, attacker, victim, k);
      kills++;
      k += int(2, 7) * TICK_RATE;
    }

    if (how === "bomb") {
      endTick = (plantTick ?? k) + BOMB_TIMER_TICKS;
      reason = "bomb_exploded";
      const siteP = site === "A" ? P.aSite : P.bSite;
      emit("bomb_exploded", { tick: endTick, user_steamid: planter?.steamId ?? "", user_X: siteP.x, user_Y: siteP.y, user_Z: 0, site: SITE_ENTITY[site] });
    } else if (how === "defuse") {
      const defuser = alive(3, k)[0];
      endTick = k + 5 * TICK_RATE;
      reason = "bomb_defused";
      if (defuser) {
        const dp = posAt(defuser.steamId, endTick).p;
        emit("bomb_defused", { tick: endTick, user_steamid: defuser.steamId, user_name: defuser.name, user_X: dp.x, user_Y: dp.y, user_Z: 0, site: SITE_ENTITY[site], user_last_place_name: placeName(dp) });
      }
    } else if (how === "time") {
      endTick = r.freezeEndTick + 75 * TICK_RATE;
      reason = "target_saved";
    } else {
      endTick = 0;
      reason = winnerSide === "CT" ? "t_killed" : "ct_killed";
    }
    const lastDeath = Math.max(0, ...[...r.death.values()]);
    endTick = Math.max(endTick, lastDeath + 2 * TICK_RATE);
    r.endTick = endTick;
    // demoparser2 0.41 format: numeric side and RoundEndReason code (see round-end.ts).
    emit("round_end", {
      tick: endTick,
      winner: winnerSide === "T" ? 2 : 3,
      reason: REASON_CODE[reason],
      message: winnerSide === "T" ? "#SFUI_Notice_Terrorists_Win" : "#SFUI_Notice_CTs_Win",
      round: number,
    });

    // Reload after shooting, for the players still alive.
    for (const p of players) {
      const shots = r.shots.get(p.steamId)!;
      const death = r.death.get(p.steamId) ?? Infinity;
      if (shots.length === 0) continue;
      const reloadTick = shots[shots.length - 1] + int(20, 60);
      if (reloadTick >= death || reloadTick >= endTick) continue;
      r.reloads.get(p.steamId)!.push(reloadTick);
      const at = posAt(p.steamId, reloadTick).p;
      const lo = r.loadout.get(p.steamId)!;
      emit("weapon_reload", {
        tick: reloadTick, user_steamid: p.steamId, user_name: p.name, user_X: at.x, user_Y: at.y, user_Z: 0,
        user_active_weapon_name: lo.display, user_active_weapon_ammo: Math.max(1, lo.clip - shots.length),
      });
    }

    // Economy after the round.
    const winnerTeam: 2 | 3 = players.find((p) => r.side.get(p.steamId) === winnerCode)!.finalTeam;
    for (const p of players) {
      const won = p.finalTeam === winnerTeam;
      const streakKey = p.finalTeam === 3 ? "A" : "B";
      const bonus = won ? 3250 : 1400 + 500 * Math.min(4, lossStreak[streakKey]);
      money.set(p.steamId, Math.min(16000, money.get(p.steamId)! + bonus));
    }
    lossStreak[winnerTeam === 3 ? "B" : "A"]++;
    lossStreak[winnerTeam === 3 ? "A" : "B"] = 0;

    rounds.push(r);
    tick = endTick + ROUND_GAP_TICKS;
    if (number === regulationHalf && spec.rounds.length > regulationHalf) {
      emit("announce_phase_end", { tick: endTick + 64 });
      tick = endTick + HALFTIME_GAP_TICKS;
    }
  }

  // Kills, shots and damage of one duel.
  function duel(r: SimRound, attacker: SimPlayer, victim: SimPlayer, k: number) {
    const lo = r.loadout.get(attacker.steamId)!;
    const vlo = r.loadout.get(victim.steamId)!;
    const shots = lo.code === "awp" ? 1 : int(2, 6);
    const hits = Math.min(shots, lo.code === "awp" ? 1 : int(1, 3));
    const headshot = rand() < 0.45;
    // Victim shoots back first, sometimes hitting.
    const backShots = int(0, 3);
    for (let s = 0; s < backShots; s++) {
      const st = k - 30 + s * 6;
      fire(r, victim, vlo, st, attacker);
      if (s === 0 && rand() < 0.4) {
        const hp = healthAt(r, attacker.steamId, st);
        const dmg = Math.min(hp - 1, int(18, 34));
        if (dmg > 0) {
          const ap = position(r, attacker.steamId, st).p;
          const vp = position(r, victim.steamId, st).p;
          r.damage.get(attacker.steamId)!.push({ tick: st, health: hp - dmg, armor: Math.max(0, r.armor.get(attacker.steamId)! - 10) });
          emit("player_hurt", hurtRow(st, victim, attacker, vlo.code, dmg, hp - dmg, Math.max(0, r.armor.get(attacker.steamId)! - 10), "chest", vp, ap));
        }
      }
    }
    for (let s = 0; s < shots; s++) {
      const st = k - (shots - 1 - s) * 7;
      fire(r, attacker, lo, st, victim);
      const isHit = s >= shots - hits;
      if (!isHit) continue;
      const hp = healthAt(r, victim.steamId, st);
      const last = s === shots - 1;
      const dmg = last ? hp : Math.min(hp - 1, int(22, 33));
      if (dmg <= 0) continue;
      const ap = position(r, attacker.steamId, st).p;
      const vp = position(r, victim.steamId, st).p;
      r.damage.get(victim.steamId)!.push({ tick: st, health: hp - dmg, armor: r.armor.get(victim.steamId)! });
      emit("player_hurt", hurtRow(st, attacker, victim, lo.code, dmg, hp - dmg, r.armor.get(victim.steamId)!, last && headshot ? "head" : "chest", ap, vp));
    }
    r.death.set(victim.steamId, k);
    const ap = position(r, attacker.steamId, k).p;
    const vp = position(r, victim.steamId, k).p;
    const inventory = [vlo.display];
    if (rand() < 0.4) inventory.push("Flashbang");
    if (rand() < 0.25) inventory.push("Smoke Grenade");
    emit("player_death", {
      tick: k,
      attacker_steamid: attacker.steamId, attacker_name: attacker.name,
      user_steamid: victim.steamId, user_name: victim.name,
      assister_steamid: null,
      weapon: lo.code, headshot, penetrated: 0, thrusmoke: false, noscope: false, assistedflash: false,
      attacker_X: ap.x, attacker_Y: ap.y, attacker_Z: 0,
      user_X: vp.x, user_Y: vp.y, user_Z: 0,
      user_inventory: inventory,
    });
  }

  function fire(r: SimRound, shooter: SimPlayer, lo: Loadout, st: number, at: SimPlayer) {
    r.shots.get(shooter.steamId)!.push(st);
    const s = position(r, shooter.steamId, st);
    const target = position(r, at.steamId, st).p;
    const yaw = (Math.atan2(target.y - s.p.y, target.x - s.p.x) * 180) / Math.PI;
    emit("weapon_fire", {
      tick: st, user_steamid: shooter.steamId, user_name: shooter.name, weapon: `weapon_${lo.code}`,
      user_X: s.p.x, user_Y: s.p.y, user_Z: 0, user_pitch: 1.5, user_yaw: yaw,
      user_velocity_X: s.vel.x, user_velocity_Y: s.vel.y, user_velocity_Z: 0,
    });
  }

  function hurtRow(
    t: number, attacker: SimPlayer, victim: SimPlayer, weapon: string, dmg: number,
    health: number, armor: number, hitgroup: string, ap: Pt, vp: Pt
  ): Row {
    return {
      tick: t, attacker_steamid: attacker.steamId, attacker_name: attacker.name,
      user_steamid: victim.steamId, user_name: victim.name, weapon,
      dmg_health: dmg, dmg_armor: armor > 0 ? 4 : 0, health, armor, hitgroup,
      attacker_X: ap.x, attacker_Y: ap.y, attacker_Z: 0, attacker_pitch: 1.5,
      attacker_yaw: (Math.atan2(vp.y - ap.y, vp.x - ap.x) * 180) / Math.PI,
      user_X: vp.x, user_Y: vp.y, user_Z: 0,
    };
  }

  // Sort every event list by tick, like the parser's output.
  for (const list of events.values()) list.sort((a, b) => Number(a.tick) - Number(b.tick));

  const lastTick = rounds[rounds.length - 1].endTick + 64;
  emit("cs_win_panel_match", { tick: rounds[rounds.length - 1].endTick + 32 });
  const header: Row = {
    map_name: "de_mirage",
    playback_time: lastTick / TICK_RATE,
    tickrate: TICK_RATE,
    playback_ticks: lastTick,
    server_name: "CS2 Analyst E2E fixture",
  };

  function roundAt(t: number): SimRound | null {
    for (const r of rounds) if (t >= r.startTick && t <= r.endTick) return r;
    // Between rounds: the next round's spawn state.
    return rounds.find((r) => r.startTick > t) ?? rounds[rounds.length - 1] ?? null;
  }

  /** Rounds a team (by final team_number) has won by tick t. */
  function roundsWonBy(team: 2 | 3, t: number): number {
    let won = 0;
    for (const r of rounds) {
      if (r.endTick > t) break;
      const member = players.find((p) => p.finalTeam === team)!;
      const side = r.side.get(member.steamId);
      const [winner] = spec.rounds[r.number - 1].split(":");
      if ((winner === "T" ? 2 : 3) === side) won++;
    }
    return won;
  }

  function rowsAt(t: number, props: string[]): Row[] {
    const r = roundAt(t);
    if (!r) return [];
    const out: Row[] = [];
    const states = players.map((p) => ({ p, s: position(r, p.steamId, t), alive: (r.death.get(p.steamId) ?? Infinity) > t }));
    for (const { p, s, alive } of states) {
      const row: Row = { tick: t, steamid: p.steamId, name: p.name };
      const lo = r.loadout.get(p.steamId)!;
      for (const prop of props) {
        switch (prop) {
          case "X": row.X = s.p.x; break;
          case "Y": row.Y = s.p.y; break;
          case "Z": row.Z = 0; break;
          case "velocity_X": row.velocity_X = alive ? s.vel.x : 0; break;
          case "velocity_Y": row.velocity_Y = alive ? s.vel.y : 0; break;
          case "velocity_Z": row.velocity_Z = 0; break;
          case "pitch": row.pitch = 1.5; break;
          case "yaw": row.yaw = yawAt(r, p.steamId, t, s); break;
          case "health": row.health = alive ? healthAt(r, p.steamId, t) : 0; break;
          case "armor_value": row.armor_value = alive ? r.armor.get(p.steamId) : 0; break;
          case "is_alive": row.is_alive = alive; break;
          case "team_num": row.team_num = r.side.get(p.steamId); break;
          case "active_weapon_name": row.active_weapon_name = alive ? lo.display : null; break;
          case "flash_duration": row.flash_duration = flashAt(r, p.steamId, t); break;
          case "active_weapon_ammo": {
            const fired = r.shots.get(p.steamId)!.filter((x) => x <= t).length;
            const reloaded = r.reloads.get(p.steamId)!.some((x) => x + 150 <= t);
            row.active_weapon_ammo = alive ? (reloaded ? lo.clip : Math.max(1, lo.clip - fired)) : null;
            break;
          }
          case "approximate_spotted_by":
            row.approximate_spotted_by = alive
              ? states
                  .filter((o) => o.alive && r.side.get(o.p.steamId) !== r.side.get(p.steamId) && dist(o.s.p, s.p) < SPOT_RANGE)
                  .map((o) => o.p.steamId)
              : [];
            break;
          case "current_equip_value": row.current_equip_value = r.equip.get(p.steamId); break;
          case "balance": row.balance = r.balance.get(p.steamId); break;
          case "last_place_name": row.last_place_name = placeName(s.p); break;
          case "rank": row.rank = byId.get(p.steamId)!.rating; break;
          case "comp_rank_type": row.comp_rank_type = 11; break;
          case "team_rounds_total": row.team_rounds_total = roundsWonBy(p.finalTeam, t); break;
        }
      }
      out.push(row);
    }
    return out;
  }

  return { header, players, events, rowsAt };
}

function position(r: SimRound, id: string, t: number): { p: Pt; vel: Pt; dir: Pt } {
  const route = r.route.get(id)!;
  const start = r.moveStart.get(id)!;
  const stopAt = Math.min(r.hold.get(id) ?? Infinity, r.death.get(id) ?? Infinity);
  const len = r.routeLen.get(id)!;
  const travelled = Math.max(0, Math.min(t, stopAt) - start) * RUN_SPEED;
  const d = Math.min(len, travelled);
  const { p, dir } = pointAlong(route, d);
  const moving = t > start && t < stopAt && travelled < len;
  return { p, dir, vel: moving ? { x: dir.x * RUN_SPEED * TICK_RATE, y: dir.y * RUN_SPEED * TICK_RATE } : { x: 0, y: 0 } };
}

function yawAt(r: SimRound, id: string, t: number, s: { p: Pt; dir: Pt }): number {
  const targets = r.target.get(id)!.filter((x) => x.from <= t);
  const current = targets[targets.length - 1];
  if (current) {
    const tp = position(r, current.at, t).p;
    return (Math.atan2(tp.y - s.p.y, tp.x - s.p.x) * 180) / Math.PI;
  }
  return (Math.atan2(s.dir.y, s.dir.x) * 180) / Math.PI;
}

function healthAt(r: SimRound, id: string, t: number): number {
  let hp = 100;
  for (const d of r.damage.get(id)!) if (d.tick <= t) hp = d.health;
  return hp;
}

function flashAt(r: SimRound, id: string, t: number): number {
  for (const b of r.blind.get(id)!) {
    const left = b.duration - (t - b.tick) / TICK_RATE;
    if (t >= b.tick && left > 0) return b.duration;
  }
  return 0;
}

function placeName(p: Pt): string {
  let best = "";
  let bestD = Infinity;
  for (const [pt, name] of PLACE_NAMES) {
    const d = dist(pt, p);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}
