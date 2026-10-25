/**
 * Anti-strat (S17): what a rival team does, from every demo the team has of
 * them — T defaults, executes (site, pace, utility before the hit), CT setups
 * and stacks, early CT aggression, retakes, pistol and force-buy habits, and
 * each rival player's spots and role. Insights are short counter-strategy
 * facts with the numbers behind them.
 *
 * Inputs are the same DB data the S12 tactics use (RoundTicks frames, kills,
 * bomb events, freeze-end economy) plus grenade detonations. Sides are per
 * round: the stored winner + score deltas (`createSideResolver`), frames when
 * they disagree. Positions are named with the map's learned callouts and
 * grouped into zones (A / mid / B) around the bombsites' plant spots.
 *
 * Pure module (no DB), covered by `npm run test:team`.
 */
import { createSideResolver, type Side } from "@/lib/utils/sideSplit";
import {
  ANCHOR_DELAY_S,
  FULL_BUY_EQUIP,
  freezeEndTick,
  type TacticsBomb,
  type TacticsEcon,
  type TacticsFrame,
  type TacticsKill,
  type TacticsRound,
} from "@/lib/analysis/tactics";
import type { FinalSide } from "./roster";

/** Bump when the analysis or its output shape changes: cached reports are rebuilt. */
export const ANTISTRAT_VERSION = 6;

/** Routes of a T round without a site hit are followed this long. */
export const PATH_NO_HIT_S = 45;
/** Routes of a T round with a hit are followed this long after it. */
export const PATH_AFTER_HIT_S = 8;
/** T default = rival positions this long after freeze end. */
export const DEFAULT_PROBE_S = 15;
/** CT setup = positions this long after freeze end (same as the S12 anchor). */
export const SETUP_PROBE_S = ANCHOR_DELAY_S;
/** A position this close to a bombsite's plant spot is "on the site". */
export const SITE_ZONE = 1100;
/** T players that must reach a site for it to count as hit without a plant. */
export const HIT_PLAYERS = 2;
/** Execute pace from freeze end to the hit: fast below, late above. */
export const FAST_HIT_S = 35;
export const LATE_HIT_S = 70;
/** Utility thrown this long before the hit belongs to the execute. */
export const EXECUTE_UTILITY_S = 20;
/** CT kills / deaths off-site in this window after freeze end = early aggression. */
export const AGGRESSION_WINDOW_S = 30;
/** CT utility thrown in this window after freeze end = early utility. */
export const EARLY_UTILITY_S = 25;
/** Average rival equipment below which a round is an eco. */
export const ECO_EQUIP = 1500;
/** A T this far from every rival teammate at the default probe is lurking. */
export const LURK_DISTANCE = 1500;
/** Kill share with an AWP that makes a player the AWPer. */
export const AWP_SHARE = 0.35;
/** Same CT spot this often = anchor. */
export const ANCHOR_SHARE = 0.6;
/** Rounds a statement needs before it becomes an insight. */
export const MIN_INSIGHT_ROUNDS = 4;
const MAX_EXAMPLES = 4;

export type Zone = "A" | "B" | "mid";
export type Pace = "fast" | "default" | "late";
export type BuyKind = "pistol" | "eco" | "force" | "full";

export interface Point {
  x: number;
  y: number;
}
export interface Point3 extends Point {
  z: number;
}

// ─── Inputs ──────────────────────────────────────────────

export interface AntiStratGrenade {
  roundNumber: number;
  tick: number;
  throwerSteamId: string;
  type: string;
  landX: number;
  landY: number;
  landZ: number;
  /** Where it was thrown from (older callers may leave it out). */
  throwX?: number;
  throwY?: number;
  throwZ?: number;
}

export interface AntiStratPlayerLine {
  steamId: string;
  name: string;
  team: FinalSide;
  kills: number;
  deaths: number;
  adr: number;
  hltvRating: number;
  firstKills: number;
  firstDeaths: number;
}

export interface AntiStratMatch {
  matchId: string;
  map: string;
  date: string;
  tickRate: number;
  scoreCT: number;
  scoreT: number;
  /** Side the rival finished on. */
  rivalSide: FinalSide;
  rounds: TacticsRound[];
  kills: Array<TacticsKill & { weapon?: string }>;
  bombs: TacticsBomb[];
  grenades: AntiStratGrenade[];
  economy: TacticsEcon[];
  players: AntiStratPlayerLine[];
}

export interface AntiStratMapContext {
  /** Bombsite plant spots (mean of every plant on the map). */
  sites: Partial<Record<"A" | "B", Point3>>;
  /** Callout of a position (learned, S11), null when unknown. */
  place: (p: Point3) => string | null;
  /**
   * The demo's own callout when `place` also answers with admin-drawn zones
   * ("Ninja" inside "Bombsite A"): used to tell when a T reached the site.
   */
  demoPlace?: (p: Point3) => string | null;
}

export interface AntiStratInput {
  rival: string[];
  matches: AntiStratMatch[];
  maps: Record<string, AntiStratMapContext>;
}

// ─── Outputs ─────────────────────────────────────────────

export interface Example {
  matchId: string;
  round: number;
  tick: number;
}

export interface Rate {
  n: number;
  of: number;
}

export interface PlaceShare {
  place: string;
  /** Rounds with a rival there / rounds of that side. */
  rounds: number;
  of: number;
}

export interface UtilityUse {
  type: string;
  place: string;
  /** Rounds it was thrown in. */
  rounds: number;
}

export interface ExecuteGroup {
  site: "A" | "B";
  pace: Pace;
  rounds: number;
  wins: number;
  /** Mean seconds from freeze end to the hit. */
  hitS: number;
  planted: number;
  /** Mean rival T on the site at the hit. */
  players: number;
  utility: UtilityUse[];
  examples: Example[];
}

export interface CtSetup {
  /** Players on A / mid / B at the setup probe, e.g. { A: 2, mid: 1, B: 2 }. */
  A: number;
  mid: number;
  B: number;
  rounds: number;
  wins: number;
  examples: Example[];
}

export interface BoardToken {
  steamId: string;
  name: string;
  x: number;
  y: number;
}

export interface MapAntiStrat {
  map: string;
  matches: number;
  t: {
    rounds: number;
    wins: number;
    /** Hits per site; `none` = no site reached (saves, picks only). */
    sites: { A: number; B: number; none: number };
    paces: Record<Pace, number>;
    executes: ExecuteGroup[];
    defaults: PlaceShare[];
    /** Callouts where the rival's first kill / first death of the round happened. */
    openings: Array<{ place: string; kills: number; deaths: number }>;
    byBuy: Record<
      BuyKind,
      { rounds: number; wins: number; A: number; B: number }
    >;
    lurkRounds: number;
    /** Median default positions of the most common setup, world units. */
    board: BoardToken[];
  };
  ct: {
    rounds: number;
    wins: number;
    setups: CtSetup[];
    positions: PlaceShare[];
    /** Rounds with a stack (≥ 3 on one site at the probe). */
    stacks: { A: number; B: number };
    aggression: {
      rounds: number;
      places: Array<{ place: string; kills: number; deaths: number }>;
    };
    utility: UtilityUse[];
    retakes: {
      rounds: number;
      won: number;
      saved: number;
      aliveAtPlant: number;
    };
    board: BoardToken[];
  };
  pistols: { t: Rate & { A: number; B: number }; ct: Rate };
  /** Rival buy in the round after losing a pistol. */
  afterPistolLoss: { eco: number; force: number; full: number };
}

export interface RivalPlayer {
  steamId: string;
  name: string;
  matches: number;
  kills: number;
  deaths: number;
  adr: number;
  rating: number;
  firstKills: number;
  firstDeaths: number;
  awpKills: number;
  ctSpot: PlaceShare | null;
  tSpot: PlaceShare | null;
  roles: Array<"awp" | "entry" | "lurk" | "anchor">;
}

export interface Insight {
  key:
    | "tSite"
    | "tFast"
    | "tLate"
    | "tExecute"
    | "ctSetup"
    | "ctStack"
    | "ctAggro"
    | "retakeWeak"
    | "retakeStrong"
    | "forceAfterPistol"
    | "ecoAfterPistol"
    | "pistolSite"
    | "anchor"
    | "awp"
    | "lurk"
    | "entry";
  map: string | null;
  params: Record<string, string | number>;
  /** Higher = shown first. */
  weight: number;
  example?: Example;
}

/** One round of the rival, as played (the single-demo team breakdown). */
export interface RoundBreakdown {
  matchId: string;
  round: number;
  side: Side;
  buy: BuyKind;
  won: boolean;
  /** Tick to open the 2D replay at (the hit on T, the setup probe on CT). */
  tick: number;
  /** Rival players and their callout at the probe (T default / CT setup). */
  positions: Array<{ steamId: string; place: string; x?: number; y?: number }>;
  /** Utility thrown for the hit (T) or early in the round (CT). */
  utility: Array<{ type: string; place: string }>;
  /** Every rival grenade of the round: type, landing callout, seconds after freeze end. */
  thrown: Array<{ type: string; place: string; s: number; by: string; from: string | null; x?: number; y?: number }>;
  /**
   * T: each rival player's route this round, callouts in visiting order (no
   * repeats) from freeze end to the hit (or PATH_NO_HIT_S without one), and
   * whether they reached the hit site. The breakdown turns these into
   * "Split A: 3 Con, 2 Ramp" with the map's lanes (src/lib/team/map-lanes.ts).
   */
  paths: Array<{ steamId: string; path: string[]; onSite: boolean }>;
  /** Rival kills with an AWP this round: who, from where, seconds after freeze end. */
  awp: Array<{ steamId: string; place: string; s: number }>;
  /** T: site hit, pace, seconds to the hit, plant, players on site, lurkers. */
  site: "A" | "B" | null;
  pace: Pace | null;
  hitS: number | null;
  planted: boolean;
  playersOnSite: number;
  lurkers: string[];
  /** CT: players per zone at the probe, early off-site duels, retake. */
  setup: { A: number; mid: number; B: number } | null;
  aggression: Array<{ place: string; kill: boolean }>;
  retake: { alive: number; saved: boolean } | null;
}

export interface AntiStratReport {
  version: number;
  matches: Array<{
    matchId: string;
    map: string;
    date: string;
    rivalScore: number;
    oppScore: number;
  }>;
  maps: MapAntiStrat[];
  players: RivalPlayer[];
  insights: Insight[];
  rounds: RoundBreakdown[];
}

// ─── Helpers ─────────────────────────────────────────────

const dist2 = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** 3D: on Nuke the sites are stacked, only the height tells them apart. */
const dist3 = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const r1 = (v: number) => Math.round(v * 10) / 10;

function frameAt(frames: TacticsFrame[], tick: number): TacticsFrame | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  if (tick <= frames[0].tick) return frames[0];
  if (tick >= frames[hi].tick) return frames[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tick <= tick) lo = mid;
    else hi = mid;
  }
  return tick - frames[lo].tick <= frames[hi].tick - tick
    ? frames[lo]
    : frames[hi];
}

/** A, B or mid for a position: nearest plant spot within SITE_ZONE, else the callout's name. */
export function zoneOf(p: Point3, ctx: AntiStratMapContext): Zone {
  let best: Zone = "mid";
  let bestD = SITE_ZONE;
  for (const site of ["A", "B"] as const) {
    const s = ctx.sites[site];
    if (!s) continue;
    const d = dist3(p, s);
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  if (best !== "mid" || (ctx.sites.A && ctx.sites.B)) return best;
  const name = ctx.place(p)?.toLowerCase() ?? "";
  if (/bombsite ?a\b|\ba ?site\b/.test(name)) return "A";
  if (/bombsite ?b\b|\bb ?site\b/.test(name)) return "B";
  return "mid";
}

/**
 * Rival buy from the average equipment at freeze end. The round after a won
 * pistol is the winners' full buy (SMGs and armour are all they can and need
 * to buy), never a force, whatever the equipment value says.
 */
export function buyKind(roundNumber: number, avgEquip: number, wonPistol = false): BuyKind {
  if (roundNumber === 1 || roundNumber === 13) return "pistol";
  if (wonPistol && (roundNumber === 2 || roundNumber === 14)) return "full";
  if (avgEquip < ECO_EQUIP) return "eco";
  if (avgEquip < FULL_BUY_EQUIP) return "force";
  return "full";
}

export function paceOf(hitS: number): Pace {
  return hitS < FAST_HIT_S ? "fast" : hitS > LATE_HIT_S ? "late" : "default";
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

class Counter<K> {
  readonly m = new Map<K, number>();
  add(k: K, n = 1) {
    this.m.set(k, (this.m.get(k) ?? 0) + n);
  }
  get(k: K) {
    return this.m.get(k) ?? 0;
  }
  top(n: number): Array<[K, number]> {
    return [...this.m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  }
}

const utilityKind = (type: string) =>
  type === "INCENDIARY" ? "MOLOTOV" : type;

// ─── Per-round facts ─────────────────────────────────────

interface TRoundFact {
  ex: Example;
  won: boolean;
  site: "A" | "B" | null;
  pace: Pace | null;
  hitS: number | null;
  planted: boolean;
  playersOnSite: number;
  utility: Set<string>; // "TYPE|place"
  defaults: Set<string>;
  positions: Map<string, { p: Point3; place: string }>;
  buy: BuyKind;
  lurkers: string[];
}

interface CtRoundFact {
  ex: Example;
  won: boolean;
  setup: { A: number; mid: number; B: number } | null;
  positions: Map<string, { p: Point3; place: string }>;
  aggression: Array<{ place: string; kill: boolean }>;
  utility: Set<string>;
  retake: { alive: number; saved: boolean } | null;
  buy: BuyKind;
}

interface MapAcc {
  map: string;
  matches: Set<string>;
  t: TRoundFact[];
  ct: CtRoundFact[];
  openings: Map<string, { kills: number; deaths: number }>;
  pistolsT: { n: number; of: number; A: number; B: number };
  pistolsCt: Rate;
  afterPistolLoss: { eco: number; force: number; full: number };
}

// ─── Analysis ────────────────────────────────────────────

export function analyzeRival(input: AntiStratInput): AntiStratReport {
  const rival = new Set(input.rival);
  const accs = new Map<string, MapAcc>();
  const players = new Map<
    string,
    RivalPlayer & {
      adrSum: number;
      ratingSum: number;
      ct: Counter<string>;
      tc: Counter<string>;
      ctRounds: number;
      tRounds: number;
      lurk: number;
      entries: number;
    }
  >();
  const reportMatches: AntiStratReport["matches"] = [];
  const roundLog: RoundBreakdown[] = [];
  const noPlace = () => null;

  for (const m of [...input.matches].sort((a, b) =>
    b.date.localeCompare(a.date),
  )) {
    const ctx = input.maps[m.map] ?? { sites: {}, place: noPlace };
    const placeOf = (p: Point3) => ctx.place(p) ?? zoneLabel(zoneOf(p, ctx));
    const fresh: MapAcc = {
      map: m.map,
      matches: new Set<string>(),
      t: [],
      ct: [],
      openings: new Map(),
      pistolsT: { n: 0, of: 0, A: 0, B: 0 },
      pistolsCt: { n: 0, of: 0 },
      afterPistolLoss: { eco: 0, force: 0, full: 0 },
    };
    const acc = accs.get(m.map) ?? fresh;
    accs.set(m.map, acc);
    acc.matches.add(m.matchId);
    const rivalScore = m.rivalSide === "CT" ? m.scoreCT : m.scoreT;
    const oppScore = m.rivalSide === "CT" ? m.scoreT : m.scoreCT;
    reportMatches.push({
      matchId: m.matchId,
      map: m.map,
      date: m.date,
      rivalScore,
      oppScore,
    });

    // Player lines (scoreboard).
    for (const p of m.players) {
      if (!rival.has(p.steamId) || p.team !== m.rivalSide) continue;
      const s = players.get(p.steamId) ?? {
        steamId: p.steamId,
        name: p.name,
        matches: 0,
        kills: 0,
        deaths: 0,
        adr: 0,
        rating: 0,
        firstKills: 0,
        firstDeaths: 0,
        awpKills: 0,
        ctSpot: null,
        tSpot: null,
        roles: [],
        adrSum: 0,
        ratingSum: 0,
        ct: new Counter<string>(),
        tc: new Counter<string>(),
        ctRounds: 0,
        tRounds: 0,
        lurk: 0,
        entries: 0,
      };
      players.set(p.steamId, s);
      s.matches++;
      s.kills += p.kills;
      s.deaths += p.deaths;
      s.adrSum += p.adr;
      s.ratingSum += p.hltvRating;
      s.firstKills += p.firstKills;
      s.firstDeaths += p.firstDeaths;
    }
    const inRival = new Set(
      m.players
        .filter((p) => rival.has(p.steamId) && p.team === m.rivalSide)
        .map((p) => p.steamId),
    );
    for (const k of m.kills)
      if (inRival.has(k.attackerSteamId) && /awp/i.test(k.weapon ?? ""))
        players.get(k.attackerSteamId)!.awpKills++;

    const sideOf = createSideResolver(m.rounds);
    const rounds = [...m.rounds].sort((a, b) => a.number - b.number);
    const prevWon = new Map<number, boolean>();

    for (const round of rounds) {
      if (round.winner !== "CT" && round.winner !== "T") continue;
      let side: Side = sideOf(m.rivalSide, round.number);
      // Frames are the live team_num: trust them over the score inference.
      const live =
        round.frames[0]?.players
          .filter((p) => inRival.has(p.steamId))
          .map((p) => p.team) ?? [];
      if (live.length > 0)
        side =
          live.filter((s) => s === "CT").length * 2 >= live.length ? "CT" : "T";
      const won = round.winner === side;
      prevWon.set(round.number, won);
      const freezeEnd = freezeEndTick(round, m.tickRate);
      const sec = (tick: number) => (tick - freezeEnd) / m.tickRate;
      const ex = (tick: number): Example => ({
        matchId: m.matchId,
        round: round.number,
        tick,
      });

      const kills = m.kills
        .filter((k) => k.roundNumber === round.number)
        .sort((a, b) => a.tick - b.tick);
      const awp = kills
        .filter((k) => inRival.has(k.attackerSteamId) && /awp/i.test(k.weapon ?? ""))
        .map((k) => ({
          steamId: k.attackerSteamId,
          place: placeOf({ x: k.attackerPosX, y: k.attackerPosY, z: k.attackerPosZ }),
          s: Math.max(0, Math.round(sec(k.tick))),
        }));
      const deathTick = new Map<string, number>();
      for (const k of kills)
        if (!deathTick.has(k.victimSteamId))
          deathTick.set(k.victimSteamId, k.tick);
      const plant =
        m.bombs
          .filter((b) => b.roundNumber === round.number && b.type === "PLANTED")
          .sort((a, b) => a.tick - b.tick)[0] ?? null;
      const econ = m.economy.filter(
        (e) => e.roundNumber === round.number && inRival.has(e.steamId),
      );
      const avgEquip = econ.length
        ? econ.reduce((s, e) => s + e.equipValue, 0) / econ.length
        : FULL_BUY_EQUIP;
      const buy = buyKind(round.number, avgEquip, prevWon.get(round.number - 1) === true);
      const grenades = m.grenades.filter(
        (g) => g.roundNumber === round.number && inRival.has(g.throwerSteamId),
      );
      const thrown = [...grenades]
        .sort((a, b) => a.tick - b.tick)
        .map((g) => ({
          type: utilityKind(g.type),
          place: placeOf({ x: g.landX, y: g.landY, z: g.landZ }),
          s: Math.max(0, Math.round(sec(g.tick))),
          by: g.throwerSteamId,
          x: Math.round(g.landX),
          y: Math.round(g.landY),
          from: g.throwX != null && g.throwY != null && g.throwZ != null ? placeOf({ x: g.throwX, y: g.throwY, z: g.throwZ }) : null,
        }));

      // The round after a lost pistol.
      if (
        (round.number === 2 || round.number === 14) &&
        prevWon.get(round.number - 1) === false
      ) {
        acc.afterPistolLoss[
          buy === "full" ? "full" : buy === "force" ? "force" : "eco"
        ]++;
      }

      // Opening duel of the round, if the rival was in it.
      const first = kills[0];
      if (first) {
        const killer = inRival.has(first.attackerSteamId);
        const victim = inRival.has(first.victimSteamId);
        if (killer !== victim) {
          const p = killer
            ? {
                x: first.attackerPosX,
                y: first.attackerPosY,
                z: first.attackerPosZ,
              }
            : { x: first.victimPosX, y: first.victimPosY, z: first.victimPosZ };
          if (side === "T") {
            const place = placeOf(p);
            const o = acc.openings.get(place) ?? { kills: 0, deaths: 0 };
            acc.openings.set(place, o);
            if (killer) o.kills++;
            else o.deaths++;
          }
          if (side === "T") {
            const who = killer ? first.attackerSteamId : first.victimSteamId;
            const s = players.get(who);
            if (s) s.entries++;
          }
        }
      }

      const positionsAt = (tick: number) => {
        const out = new Map<string, { p: Point3; place: string }>();
        const f = frameAt(round.frames, tick);
        if (!f) return out;
        for (const q of f.players) {
          if (!inRival.has(q.steamId) || !q.isAlive || q.team !== side)
            continue;
          const p = { x: q.x, y: q.y, z: q.z };
          out.set(q.steamId, { p, place: placeOf(p) });
        }
        return out;
      };

      if (side === "T") {
        // Hit: the plant, else the first frame with HIT_PLAYERS rival Ts on one site.
        let site: "A" | "B" | null = null;
        let hitTick: number | null = null;
        let playersOnSite = 0;
        if (plant) {
          site =
            plant.site === "A" || plant.site === "B"
              ? plant.site
              : nonMid(
                  zoneOf({ x: plant.posX, y: plant.posY, z: plant.posZ }, ctx),
                );
          hitTick = plant.tick;
        }
        for (const f of round.frames) {
          if (f.tick < freezeEnd || (hitTick != null && f.tick > hitTick))
            continue;
          const on = { A: 0, B: 0 };
          for (const q of f.players) {
            if (!inRival.has(q.steamId) || !q.isAlive || q.team !== "T")
              continue;
            const z = zoneOf(q, ctx);
            if (z !== "mid") on[z]++;
          }
          const z: "A" | "B" = on.A >= on.B ? "A" : "B";
          if (on[z] >= HIT_PLAYERS && (site == null || site === z)) {
            if (site == null) site = z;
            hitTick = Math.min(hitTick ?? f.tick, f.tick);
            playersOnSite = on[z];
            break;
          }
        }
        if (plant && playersOnSite === 0) {
          const f = frameAt(round.frames, plant.tick);
          playersOnSite =
            f?.players.filter(
              (q) =>
                inRival.has(q.steamId) &&
                q.isAlive &&
                q.team === "T" &&
                zoneOf(q, ctx) === site,
            ).length ?? 0;
        }
        const hitS = hitTick != null ? Math.max(0, sec(hitTick)) : null;

        // Routes: callouts each rival T passed through until shortly after
        // the hit (players of a split arrive a few seconds after the first).
        const pathEnd = hitTick != null ? hitTick + PATH_AFTER_HIT_S * m.tickRate : freezeEnd + PATH_NO_HIT_S * m.tickRate;
        const siteKey = site ? `bombsite${site.toLowerCase()}` : null;
        const routes = new Map<string, { path: string[]; onSite: boolean }>();
        for (const f of round.frames) {
          if (f.tick < freezeEnd || f.tick > pathEnd) continue;
          for (const q of f.players) {
            if (!inRival.has(q.steamId) || !q.isAlive || q.team !== "T") continue;
            const r = routes.get(q.steamId) ?? { path: [], onSite: false };
            routes.set(q.steamId, r);
            if (r.onSite) continue;
            const place = placeOf(q);
            if (r.path[r.path.length - 1] !== place) r.path.push(place);
            // On the site = the bombsite's own callout; the plant-spot radius
            // (SITE_ZONE) also covers the lanes leading into it.
            const demo = ctx.demoPlace ? ctx.demoPlace(q) ?? place : place;
            if (siteKey && demo.toLowerCase().replace(/[^a-z0-9]/g, "") === siteKey) r.onSite = true;
          }
        }
        const paths = [...routes].map(([steamId, r]) => ({ steamId, ...r }));

        const utility = new Set<string>();
        if (hitTick != null) {
          for (const g of grenades) {
            if (
              g.tick < hitTick - EXECUTE_UTILITY_S * m.tickRate ||
              g.tick > hitTick + 3 * m.tickRate
            )
              continue;
            utility.add(
              `${utilityKind(g.type)}|${placeOf({ x: g.landX, y: g.landY, z: g.landZ })}`,
            );
          }
        }
        const probe = freezeEnd + DEFAULT_PROBE_S * m.tickRate;
        const positions = positionsAt(probe);
        const defaults = new Set<string>();
        for (const v of positions.values()) defaults.add(v.place);
        const lurkers: string[] = [];
        if (positions.size >= 3) {
          for (const [id, v] of positions) {
            const near = [...positions]
              .filter(([o]) => o !== id)
              .map(([, o]) => dist2(o.p, v.p));
            if (Math.min(...near) > LURK_DISTANCE) lurkers.push(id);
          }
        }
        for (const [id, v] of positions) {
          const s = players.get(id);
          if (!s) continue;
          s.tRounds++;
          s.tc.add(v.place);
          if (lurkers.includes(id)) s.lurk++;
        }
        roundLog.push({
          ...emptyBreakdown(ex(hitTick ?? probe), side, buy, won, positions, utility, thrown, awp),
          paths,
          site,
          pace: hitS != null ? paceOf(hitS) : null,
          hitS: hitS != null ? r1(hitS) : null,
          planted: !!plant,
          playersOnSite,
          lurkers,
        });
        acc.t.push({
          ex: ex(hitTick ?? probe),
          won,
          site,
          pace: hitS != null ? paceOf(hitS) : null,
          hitS,
          planted: !!plant,
          playersOnSite,
          utility,
          defaults,
          positions,
          buy,
          lurkers,
        });
        if (buy === "pistol") {
          acc.pistolsT.of++;
          if (won) acc.pistolsT.n++;
          if (site) acc.pistolsT[site]++;
        }
      } else {
        const probe = freezeEnd + SETUP_PROBE_S * m.tickRate;
        const positions = positionsAt(probe);
        let setup: CtRoundFact["setup"] = null;
        if (positions.size >= 3) {
          setup = { A: 0, mid: 0, B: 0 };
          for (const v of positions.values()) setup[zoneOf(v.p, ctx)]++;
        }
        for (const [id, v] of positions) {
          const s = players.get(id);
          if (!s) continue;
          s.ctRounds++;
          s.ct.add(v.place);
        }
        const aggression: CtRoundFact["aggression"] = [];
        for (const k of kills) {
          if (sec(k.tick) > AGGRESSION_WINDOW_S) break;
          const killer = inRival.has(k.attackerSteamId);
          const victim = inRival.has(k.victimSteamId);
          if (killer === victim) continue;
          const p = killer
            ? { x: k.attackerPosX, y: k.attackerPosY, z: k.attackerPosZ }
            : { x: k.victimPosX, y: k.victimPosY, z: k.victimPosZ };
          if (zoneOf(p, ctx) !== "mid") continue;
          aggression.push({ place: placeOf(p), kill: killer });
        }
        const utility = new Set<string>();
        for (const g of grenades) {
          const s = sec(g.tick);
          if (s < 0 || s > EARLY_UTILITY_S) continue;
          utility.add(
            `${utilityKind(g.type)}|${placeOf({ x: g.landX, y: g.landY, z: g.landZ })}`,
          );
        }
        let retake: CtRoundFact["retake"] = null;
        if (plant) {
          const alive = [...inRival].filter(
            (id) => (deathTick.get(id) ?? Infinity) > plant.tick,
          ).length;
          const aliveAtEnd = [...inRival].filter(
            (id) => !deathTick.has(id),
          ).length;
          retake = { alive, saved: !won && aliveAtEnd > 0 };
        }
        roundLog.push({
          ...emptyBreakdown(ex(probe), side, buy, won, positions, utility, thrown, awp),
          setup,
          aggression,
          retake,
        });
        acc.ct.push({
          ex: ex(probe),
          won,
          setup,
          positions,
          aggression,
          utility,
          retake,
          buy,
        });
        if (buy === "pistol") {
          acc.pistolsCt.of++;
          if (won) acc.pistolsCt.n++;
        }
      }
    }
  }

  // ─── Summaries ────────────────────────────────────────
  const maps: MapAntiStrat[] = [...accs.values()]
    .sort(
      (a, b) => b.matches.size - a.matches.size || a.map.localeCompare(b.map),
    )
    .map((acc) => summarizeMap(acc, players));

  const playerList: RivalPlayer[] = [...players.values()]
    .map((s) => {
      const ctTop = s.ct.top(1)[0];
      const tTop = s.tc.top(1)[0];
      const roles: RivalPlayer["roles"] = [];
      if (s.kills > 0 && s.awpKills / s.kills >= AWP_SHARE) roles.push("awp");
      if (s.tRounds >= MIN_INSIGHT_ROUNDS && s.entries / s.tRounds >= 0.3)
        roles.push("entry");
      if (s.tRounds >= MIN_INSIGHT_ROUNDS && s.lurk / s.tRounds >= 0.4)
        roles.push("lurk");
      if (
        ctTop &&
        s.ctRounds >= MIN_INSIGHT_ROUNDS &&
        ctTop[1] / s.ctRounds >= ANCHOR_SHARE
      )
        roles.push("anchor");
      return {
        steamId: s.steamId,
        name: s.name,
        matches: s.matches,
        kills: s.kills,
        deaths: s.deaths,
        adr: s.matches ? r1(s.adrSum / s.matches) : 0,
        rating: s.matches
          ? Math.round((s.ratingSum / s.matches) * 100) / 100
          : 0,
        firstKills: s.firstKills,
        firstDeaths: s.firstDeaths,
        awpKills: s.awpKills,
        ctSpot: ctTop
          ? { place: ctTop[0], rounds: ctTop[1], of: s.ctRounds }
          : null,
        tSpot: tTop ? { place: tTop[0], rounds: tTop[1], of: s.tRounds } : null,
        roles,
      };
    })
    .sort((a, b) => b.matches - a.matches || b.rating - a.rating);

  return {
    version: ANTISTRAT_VERSION,
    matches: reportMatches,
    maps,
    players: playerList,
    insights: buildInsights(maps, playerList),
    rounds: roundLog.sort((a, b) => a.matchId.localeCompare(b.matchId) || a.round - b.round),
  };
}

function emptyBreakdown(
  ex: Example,
  side: Side,
  buy: BuyKind,
  won: boolean,
  positions: Map<string, { p: Point3; place: string }>,
  utility: Set<string>,
  thrown: RoundBreakdown["thrown"],
  awp: RoundBreakdown["awp"],
): RoundBreakdown {
  return {
    matchId: ex.matchId,
    round: ex.round,
    side,
    buy,
    won,
    tick: ex.tick,
    positions: [...positions].map(([steamId, v]) => ({ steamId, place: v.place, x: Math.round(v.p.x), y: Math.round(v.p.y) })),
    utility: [...utility].map((k) => {
      const [type, place] = k.split("|");
      return { type, place };
    }),
    thrown,
    awp,
    paths: [],
    site: null,
    pace: null,
    hitS: null,
    planted: false,
    playersOnSite: 0,
    lurkers: [],
    setup: null,
    aggression: [],
    retake: null,
  };
}

const nonMid = (z: Zone): "A" | "B" | null => (z === "mid" ? null : z);
/** Label used when a position has no learned callout. */
export const zoneLabel = (z: Zone) => (z === "mid" ? "Mid" : `${z} site`);

function utilityTop(sets: Array<Set<string>>, n: number): UtilityUse[] {
  const c = new Counter<string>();
  for (const s of sets) for (const k of s) c.add(k);
  return c.top(n).map(([k, rounds]) => {
    const [type, place] = k.split("|");
    return { type, place, rounds };
  });
}

function placeShares(
  sets: Array<Set<string>>,
  of: number,
  n: number,
): PlaceShare[] {
  const c = new Counter<string>();
  for (const s of sets) for (const k of s) c.add(k);
  return c.top(n).map(([place, rounds]) => ({ place, rounds, of }));
}

/** Median position of each player over the given rounds (top 5 by rounds seen). */
function boardTokens(
  rounds: Array<{ positions: Map<string, { p: Point3 }> }>,
  nameOf: (id: string) => string,
): BoardToken[] {
  const xs = new Map<string, Point[]>();
  for (const r of rounds) {
    for (const [id, v] of r.positions) {
      const list = xs.get(id) ?? [];
      list.push(v.p);
      xs.set(id, list);
    }
  }
  return [...xs.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([id, ps]) => ({
      steamId: id,
      name: nameOf(id),
      x: Math.round(median(ps.map((p) => p.x))),
      y: Math.round(median(ps.map((p) => p.y))),
    }));
}

function summarizeMap(
  acc: MapAcc,
  players: Map<string, { name: string }>,
): MapAntiStrat {
  const nameOf = (id: string) => players.get(id)?.name ?? id;
  const t = acc.t;
  const ct = acc.ct;

  const groups = new Map<string, TRoundFact[]>();
  for (const r of t) {
    if (!r.site || !r.pace) continue;
    const key = `${r.site}|${r.pace}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const executes: ExecuteGroup[] = [...groups.entries()]
    .map(([key, rs]) => {
      const [site, pace] = key.split("|") as ["A" | "B", Pace];
      return {
        site,
        pace,
        rounds: rs.length,
        wins: rs.filter((r) => r.won).length,
        hitS: r1(rs.reduce((s, r) => s + (r.hitS ?? 0), 0) / rs.length),
        planted: rs.filter((r) => r.planted).length,
        players: r1(rs.reduce((s, r) => s + r.playersOnSite, 0) / rs.length),
        utility: utilityTop(
          rs.map((r) => r.utility),
          5,
        ),
        examples: rs.slice(0, MAX_EXAMPLES).map((r) => r.ex),
      };
    })
    .sort((a, b) => b.rounds - a.rounds || b.wins - a.wins);

  const byBuy: MapAntiStrat["t"]["byBuy"] = {
    pistol: { rounds: 0, wins: 0, A: 0, B: 0 },
    eco: { rounds: 0, wins: 0, A: 0, B: 0 },
    force: { rounds: 0, wins: 0, A: 0, B: 0 },
    full: { rounds: 0, wins: 0, A: 0, B: 0 },
  };
  for (const r of t) {
    const b = byBuy[r.buy];
    b.rounds++;
    if (r.won) b.wins++;
    if (r.site) b[r.site]++;
  }

  const setupKey = (s: { A: number; mid: number; B: number }) =>
    `${s.A}|${s.mid}|${s.B}`;
  const setupGroups = new Map<string, CtRoundFact[]>();
  for (const r of ct) {
    if (!r.setup) continue;
    const list = setupGroups.get(setupKey(r.setup)) ?? [];
    list.push(r);
    setupGroups.set(setupKey(r.setup), list);
  }
  const setups: CtSetup[] = [...setupGroups.values()]
    .map((rs) => ({
      ...rs[0].setup!,
      rounds: rs.length,
      wins: rs.filter((r) => r.won).length,
      examples: rs.slice(0, MAX_EXAMPLES).map((r) => r.ex),
    }))
    .sort((a, b) => b.rounds - a.rounds);
  const topSetup = setups[0];
  const topSetupRounds = topSetup
    ? (setupGroups.get(setupKey(topSetup)) ?? [])
    : [];

  const aggro = new Map<string, { kills: number; deaths: number }>();
  for (const r of ct) {
    for (const a of r.aggression) {
      const o = aggro.get(a.place) ?? { kills: 0, deaths: 0 };
      aggro.set(a.place, o);
      if (a.kill) o.kills++;
      else o.deaths++;
    }
  }
  const retakeRounds = ct.filter((r) => r.retake);

  // Most common T default: rounds whose spots match the most frequent site/pace group.
  const topExec = executes[0];
  const tBoardRounds = topExec
    ? t.filter((r) => r.site === topExec.site && r.pace === topExec.pace)
    : t;

  const ctPlaces = ct.map(
    (r) => new Set([...r.positions.values()].map((v) => v.place)),
  );

  return {
    map: acc.map,
    matches: acc.matches.size,
    t: {
      rounds: t.length,
      wins: t.filter((r) => r.won).length,
      sites: {
        A: t.filter((r) => r.site === "A").length,
        B: t.filter((r) => r.site === "B").length,
        none: t.filter((r) => !r.site).length,
      },
      paces: {
        fast: t.filter((r) => r.pace === "fast").length,
        default: t.filter((r) => r.pace === "default").length,
        late: t.filter((r) => r.pace === "late").length,
      },
      executes,
      defaults: placeShares(
        t.map((r) => r.defaults),
        t.length,
        8,
      ),
      openings: [...acc.openings.entries()]
        .map(([place, o]) => ({ place, ...o }))
        .sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths))
        .slice(0, 6),
      byBuy,
      lurkRounds: t.filter((r) => r.lurkers.length > 0).length,
      board: boardTokens(tBoardRounds, nameOf),
    },
    ct: {
      rounds: ct.length,
      wins: ct.filter((r) => r.won).length,
      setups: setups.slice(0, 5),
      positions: placeShares(ctPlaces, ct.length, 8),
      stacks: {
        A: ct.filter((r) => r.setup && r.setup.A >= 3).length,
        B: ct.filter((r) => r.setup && r.setup.B >= 3).length,
      },
      aggression: {
        rounds: ct.filter((r) => r.aggression.length > 0).length,
        places: [...aggro.entries()]
          .map(([place, o]) => ({ place, ...o }))
          .sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths))
          .slice(0, 5),
      },
      utility: utilityTop(
        ct.map((r) => r.utility),
        6,
      ),
      retakes: {
        rounds: retakeRounds.length,
        won: retakeRounds.filter((r) => r.won).length,
        saved: retakeRounds.filter((r) => r.retake!.saved).length,
        aliveAtPlant: retakeRounds.length
          ? r1(
              retakeRounds.reduce((s, r) => s + r.retake!.alive, 0) /
                retakeRounds.length,
            )
          : 0,
      },
      board: boardTokens(topSetupRounds.length ? topSetupRounds : ct, nameOf),
    },
    pistols: { t: acc.pistolsT, ct: acc.pistolsCt },
    afterPistolLoss: acc.afterPistolLoss,
  };
}

const pctOf = (n: number, of: number) =>
  Math.round((n / Math.max(1, of)) * 100);

/** Counter-strategy facts, strongest first. Each carries the numbers it rests on. */
export function buildInsights(
  maps: MapAntiStrat[],
  players: RivalPlayer[],
): Insight[] {
  const out: Insight[] = [];
  for (const m of maps) {
    const t = m.t;
    const hits = t.sites.A + t.sites.B;
    if (hits >= MIN_INSIGHT_ROUNDS) {
      const site = t.sites.A >= t.sites.B ? "A" : "B";
      const n = t.sites[site];
      if (n / hits >= 0.65)
        out.push({
          key: "tSite",
          map: m.map,
          params: { site, pct: pctOf(n, hits), n, of: hits },
          weight: n / hits + 0.2,
        });
    }
    const timed = t.paces.fast + t.paces.default + t.paces.late;
    if (timed >= MIN_INSIGHT_ROUNDS) {
      if (t.paces.fast / timed >= 0.35)
        out.push({
          key: "tFast",
          map: m.map,
          params: {
            pct: pctOf(t.paces.fast, timed),
            n: t.paces.fast,
            of: timed,
            s: FAST_HIT_S,
          },
          weight: t.paces.fast / timed,
        });
      if (t.paces.late / timed >= 0.4)
        out.push({
          key: "tLate",
          map: m.map,
          params: {
            pct: pctOf(t.paces.late, timed),
            n: t.paces.late,
            of: timed,
            s: LATE_HIT_S,
          },
          weight: t.paces.late / timed - 0.05,
        });
    }
    const ex = t.executes[0];
    if (ex && ex.rounds >= 3 && ex.utility.length > 0) {
      const u = ex.utility[0];
      out.push({
        key: "tExecute",
        map: m.map,
        params: {
          site: ex.site,
          s: Math.round(ex.hitS),
          type: u.type,
          place: u.place,
          n: u.rounds,
          of: ex.rounds,
        },
        weight: 0.5 + ex.rounds / Math.max(1, t.rounds),
        example: ex.examples[0],
      });
    }
    const top = m.ct.setups[0];
    if (
      top &&
      m.ct.rounds >= MIN_INSIGHT_ROUNDS &&
      top.rounds / m.ct.rounds >= 0.4
    ) {
      out.push({
        key: "ctSetup",
        map: m.map,
        params: {
          setup: `${top.A}-${top.mid}-${top.B}`,
          pct: pctOf(top.rounds, m.ct.rounds),
          n: top.rounds,
          of: m.ct.rounds,
        },
        weight: top.rounds / m.ct.rounds,
        example: top.examples[0],
      });
    }
    for (const site of ["A", "B"] as const) {
      const n = m.ct.stacks[site];
      if (m.ct.rounds >= MIN_INSIGHT_ROUNDS && n / m.ct.rounds >= 0.25) {
        out.push({
          key: "ctStack",
          map: m.map,
          params: {
            site,
            pct: pctOf(n, m.ct.rounds),
            n,
            of: m.ct.rounds,
            other: site === "A" ? "B" : "A",
          },
          weight: n / m.ct.rounds + 0.1,
        });
      }
    }
    const ag = m.ct.aggression;
    if (
      m.ct.rounds >= MIN_INSIGHT_ROUNDS &&
      ag.rounds / m.ct.rounds >= 0.3 &&
      ag.places[0]
    ) {
      out.push({
        key: "ctAggro",
        map: m.map,
        params: {
          place: ag.places[0].place,
          pct: pctOf(ag.rounds, m.ct.rounds),
          n: ag.rounds,
          of: m.ct.rounds,
          s: AGGRESSION_WINDOW_S,
        },
        weight: ag.rounds / m.ct.rounds,
      });
    }
    const rt = m.ct.retakes;
    if (rt.rounds >= MIN_INSIGHT_ROUNDS) {
      if (rt.won / rt.rounds <= 0.3)
        out.push({
          key: "retakeWeak",
          map: m.map,
          params: { n: rt.won, of: rt.rounds, saved: rt.saved },
          weight: 0.8 - rt.won / rt.rounds,
        });
      else if (rt.won / rt.rounds >= 0.55)
        out.push({
          key: "retakeStrong",
          map: m.map,
          params: { n: rt.won, of: rt.rounds },
          weight: rt.won / rt.rounds - 0.1,
        });
    }
    const ap = m.afterPistolLoss;
    const apN = ap.eco + ap.force + ap.full;
    if (apN >= 2) {
      if (ap.force / apN >= 0.66)
        out.push({
          key: "forceAfterPistol",
          map: m.map,
          params: { n: ap.force, of: apN },
          weight: 0.6,
        });
      else if (ap.eco / apN >= 0.66)
        out.push({
          key: "ecoAfterPistol",
          map: m.map,
          params: { n: ap.eco, of: apN },
          weight: 0.4,
        });
    }
    const pt = m.pistols.t;
    const pHits = pt.A + pt.B;
    if (pHits >= 2) {
      const site = pt.A >= pt.B ? "A" : "B";
      if (pt[site] / pHits >= 0.75)
        out.push({
          key: "pistolSite",
          map: m.map,
          params: { site, n: pt[site], of: pHits },
          weight: 0.45,
        });
    }
  }
  for (const p of players) {
    if (p.roles.includes("awp")) {
      out.push({
        key: "awp",
        map: null,
        params: {
          name: p.name,
          pct: pctOf(p.awpKills, p.kills),
          spot: p.ctSpot?.place ?? "—",
        },
        weight: 0.7,
      });
    }
    if (p.roles.includes("anchor") && p.ctSpot) {
      out.push({
        key: "anchor",
        map: null,
        params: {
          name: p.name,
          place: p.ctSpot.place,
          pct: pctOf(p.ctSpot.rounds, p.ctSpot.of),
          n: p.ctSpot.rounds,
          of: p.ctSpot.of,
        },
        weight: 0.55 + p.ctSpot.rounds / Math.max(1, p.ctSpot.of) / 4,
      });
    }
    if (p.roles.includes("lurk") && p.tSpot) {
      out.push({
        key: "lurk",
        map: null,
        params: { name: p.name, place: p.tSpot.place },
        weight: 0.5,
      });
    }
    if (p.roles.includes("entry")) {
      out.push({
        key: "entry",
        map: null,
        params: { name: p.name, kills: p.firstKills, deaths: p.firstDeaths },
        weight: 0.45,
      });
    }
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 12);
}
