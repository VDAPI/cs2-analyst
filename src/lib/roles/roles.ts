/**
 * Role detection (S24): which role a player had in a match (entry, AWP,
 * support, lurk, anchor), from where they stood, who on their team made
 * contact first and which gun got their kills. Pure (no DB); the input is
 * the same TacticsInput the S12 analysis reads from the DB. Covered by
 * `npm run test:roles`.
 *
 * Roles are per side, decided inside each team (an entry is the T who makes
 * the team's first contact most often, not anyone above a fixed bar):
 * - awp: most of the player's kills on that side are AWP kills (one per team),
 * - T side: entry = first of the team into contact most often; lurk = plays
 *   farthest from the rest of the team; the others are support,
 * - CT side: anchor = set up on a bombsite in most rounds; mid = set up on
 *   a mid callout in most rounds; rotator = set up between the sites or moved
 *   to the other site often (S31); the others are support.
 * The match role is AWP when the player AWPed, otherwise the T role when it
 * is entry or lurk, otherwise the CT role when it is anchor, rotator or mid,
 * otherwise support.
 *
 * Positions are sampled the way the S12 analysis does it: the setup spot is
 * where the player stands ANCHOR_DELAY_S after freeze end. Since S31 every
 * round also keeps its callout, zone (A / B / mid, sites.ts), the path of
 * callouts the player went through, whether the spot was isolated from the
 * team and whether the player took part in any fight (activity).
 */
import {
  ANCHOR_DELAY_S,
  dist,
  frameAt,
  freezeEndTick,
  roundSides,
  SITE_RANGE,
  type TacticsInput,
  type TacticsRound,
} from "@/lib/analysis/tactics";
import { mergeSites, siteCentresFromPlants, zoneOf, type SiteCentres, type Zone } from "@/lib/analysis/sites";

/** Bump when detection or the stored profile changes; it is part of NORMS_STAMP. */
export const ROLES_VERSION = 2;

export type Role = "entry" | "awp" | "support" | "lurk" | "anchor" | "rotator" | "mid";
export const ROLES: Role[] = ["entry", "awp", "lurk", "anchor", "rotator", "mid", "support"];
export const T_ROLES: Role[] = ["entry", "awp", "lurk", "support"];
export const CT_ROLES: Role[] = ["awp", "anchor", "rotator", "mid", "support"];
/** Roles a side can have (what the report's "correct your role" picker offers). */
export const SIDE_ROLES: Record<Side, Role[]> = { T: T_ROLES, CT: CT_ROLES };
export const isRole = (x: unknown): x is Role => typeof x === "string" && (ROLES as string[]).includes(x);

type Side = "CT" | "T";

/** AWPer on a side: at least this many AWP kills… */
export const AWP_MIN_KILLS = 3;
/** …and at least this share of the player's kills. */
export const AWP_SHARE = 0.35;
/** Entry: first of the team into contact in at least this share of rounds. */
export const ENTRY_SHARE = 0.25;
/** Lurk: median distance to the nearest teammate at least this (units). */
export const LURK_DISTANCE = 1200;
/** Anchor: on a bombsite at setup in at least this share of rounds with a spot. */
export const ANCHOR_SHARE = 0.5;
/** Fewer rounds than this on a side say nothing about the role there. */
export const MIN_SIDE_ROUNDS = 4;
/** Team spacing is sampled this often from freeze end… */
export const SPACING_STEP_S = 2;
/** …until the round's first kill, or at most this long. */
export const SPACING_WINDOW_S = 40;
/** Setup spots are stored rounded to this grid (units). */
export const SPOT_GRID = 16;
/** Mid: set up on a mid callout in at least this share of rounds with a spot. */
export const MID_SHARE = 0.5;
/** Rotator: set up between the sites, or moved to another site, in at least this share of rounds. */
export const ROTATOR_SHARE = 0.3;
/** A setup spot this far from every alive teammate is isolated (S31). */
export const ISOLATED_RANGE = 1200;
/** The round's path is sampled this often from freeze end… */
export const PATH_STEP_S = 2;
/** …for at most this long, and keeps at most this many callouts. */
export const PATH_WINDOW_S = 90;
export const PATH_MAX = 6;
/** Callouts that name the middle of the map ("TopofMid", "Middle", "MidDoors"). */
export const MID_PLACE = /mid/i;

/** Where one player was in one round (S31). */
export interface RoundSpot {
  round: number;
  /** Callout of the setup spot (ANCHOR_DELAY_S after freeze end), when the map has names. */
  place: string | null;
  /** Zone of the setup spot, when the map's sites are known. */
  zone: Zone | null;
  /** Callouts the player went through from freeze end, in order (consecutive repeats dropped). */
  path: string[];
  /** No alive teammate within ISOLATED_RANGE at the setup spot. */
  isolated: boolean;
  /** Dealt or took damage from an enemy this round. */
  contact: boolean;
  /** Went from the setup zone to another site while alive. */
  rotated: boolean;
  /** Seconds after freeze end the player died, null when they survived. */
  diedS: number | null;
}

/** One player's numbers on one side, the basis of the role and of the "play like a pro" comparison. */
export interface SideProfile {
  side: Side;
  rounds: number;
  kills: number;
  awpKills: number;
  /** Rounds in which the player was the first of their team to deal or take damage from an enemy. */
  firstContacts: number;
  /** Median seconds after freeze end of the player's first contact (damage dealt or taken). */
  contactTimeS: number | null;
  /** Median seconds after freeze end of the player's death, over rounds they died in. */
  deathTimeS: number | null;
  /** Median distance (units) to the nearest alive teammate before the round's first kill. */
  teamDistance: number | null;
  /** Rounds with a setup spot… */
  spotRounds: number;
  /** …of which on a bombsite. */
  siteRounds: number;
  /** Setup spots ([x, y, z], rounded to SPOT_GRID), one per round with a spot. */
  spots: Array<[number, number, number]>;
  // S31 (missing on profiles stored before ROLES_VERSION 2):
  /** Rounds with any fight (damage dealt or taken). */
  contactRounds?: number;
  /** Setup zones over the rounds with a spot. */
  zones?: Record<Zone, number>;
  /** Rounds with a spot on a mid callout. */
  midRounds?: number;
  /** Rounds with an isolated setup spot. */
  isolatedRounds?: number;
  /** Rounds in which the player moved to another site. */
  rotations?: number;
  /** One entry per round with a spot, in round order. */
  roundSpots?: RoundSpot[];
}

export interface PlayerRoles {
  steamId: string;
  /** Match role (see the module comment), null when neither side had enough rounds. */
  role: Role | null;
  sides: Partial<Record<Side, { role: Role | null; profile: SideProfile }>>;
}

export interface RoleOptions {
  /** Callout of a position (MapPlaceCell, places.ts); a name with "Bombsite" counts as on a site. */
  placeOf?: (p: { x: number; y: number; z: number }) => string | null;
  /** Bombsite centres of the map (sites.ts); this match's plants fill in a missing one. */
  sites?: SiteCentres;
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
const snap = (v: number) => Math.round(v / SPOT_GRID) * SPOT_GRID;
export const isAwp = (weapon: string | undefined) => (weapon ?? "").replace(/^weapon_/, "") === "awp";
const SITE_NAME = /bombsite/i;

function emptyProfile(side: Side): SideProfile {
  return {
    side,
    rounds: 0,
    kills: 0,
    awpKills: 0,
    firstContacts: 0,
    contactTimeS: null,
    deathTimeS: null,
    teamDistance: null,
    spotRounds: 0,
    siteRounds: 0,
    spots: [],
    contactRounds: 0,
    zones: { A: 0, B: 0, mid: 0 },
    midRounds: 0,
    isolatedRounds: 0,
    rotations: 0,
    roundSpots: [],
  };
}

/** Bombsite centres from this match's plants (average plant position per site). */
function siteCentres(input: TacticsInput): Array<{ x: number; y: number; z: number }> {
  const acc = new Map<string, { x: number; y: number; z: number; n: number }>();
  for (const b of input.bombs) {
    if (b.type !== "PLANTED") continue;
    const key = b.site ?? `${Math.round(b.posX / 1500)}|${Math.round(b.posY / 1500)}`;
    const a = acc.get(key) ?? { x: 0, y: 0, z: 0, n: 0 };
    a.x += b.posX;
    a.y += b.posY;
    a.z += b.posZ;
    a.n++;
    acc.set(key, a);
  }
  return [...acc.values()].map((a) => ({ x: a.x / a.n, y: a.y / a.n, z: a.z / a.n }));
}

interface Acc {
  profile: SideProfile;
  contactTimes: number[];
  deathTimes: number[];
  distances: number[];
}

/** Every player's profile per side and the roles that follow from them. */
export function detectRoles(input: TacticsInput, opts: RoleOptions = {}): PlayerRoles[] {
  const { tickRate } = input;
  const ids = new Set(input.players.map((p) => p.steamId));
  const finalSide = new Map(input.players.map((p) => [p.steamId, p.team]));
  const rounds = [...input.rounds].sort((a, b) => a.number - b.number);
  const totalRounds = input.totalRounds ?? rounds.at(-1)?.number ?? 0;
  const sites = siteCentres(input);
  const zoneSites = mergeSites(opts.sites, siteCentresFromPlants(input.bombs));
  const onSite = (p: { x: number; y: number; z: number }) => {
    const name = opts.placeOf?.(p);
    if (name && SITE_NAME.test(name)) return true;
    return sites.some((s) => dist(s, p) <= SITE_RANGE);
  };

  const accs = new Map<string, Acc>();
  const acc = (id: string, side: Side): Acc => {
    const key = `${id}|${side}`;
    let a = accs.get(key);
    if (!a) {
      a = { profile: emptyProfile(side), contactTimes: [], deathTimes: [], distances: [] };
      accs.set(key, a);
    }
    return a;
  };

  const byRound = <T extends { roundNumber: number }>(rows: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows) {
      const list = m.get(r.roundNumber);
      if (list) list.push(r);
      else m.set(r.roundNumber, [r]);
    }
    return m;
  };
  const killsBy = byRound(input.kills);
  const damagesBy = byRound(input.damages);

  for (const round of rounds) {
    const sideOf = roundSides(round, finalSide, totalRounds);
    const enemies = (a: string | null | undefined, b: string) => {
      if (!a) return false;
      const sa = sideOf.get(a);
      const sb = sideOf.get(b);
      return sa != null && sb != null && sa !== sb;
    };
    const freezeEnd = freezeEndTick(round, tickRate);
    const since = (tick: number) => Math.max(0, (tick - freezeEnd) / tickRate);
    const kills = (killsBy.get(round.number) ?? []).filter((k) => enemies(k.attackerSteamId, k.victimSteamId));
    kills.sort((a, b) => a.tick - b.tick);

    for (const [id, side] of sideOf) if (ids.has(id)) acc(id, side).profile.rounds++;

    for (const k of kills) {
      const side = sideOf.get(k.attackerSteamId);
      if (!side || !ids.has(k.attackerSteamId)) continue;
      const p = acc(k.attackerSteamId, side).profile;
      p.kills++;
      if (isAwp(k.weapon)) p.awpKills++;
    }

    // First contact: earliest damage or kill between enemies, per player and per team.
    const contacts: Array<{ tick: number; ids: string[] }> = [
      ...(damagesBy.get(round.number) ?? [])
        .filter((d) => enemies(d.attackerSteamId, d.victimSteamId))
        .map((d) => ({ tick: d.tick, ids: [d.attackerSteamId as string, d.victimSteamId] })),
      ...kills.map((k) => ({ tick: k.tick, ids: [k.attackerSteamId, k.victimSteamId] })),
    ].sort((a, b) => a.tick - b.tick);
    const firstOf = new Map<string, number>();
    const teamFirst = new Map<Side, string>();
    for (const c of contacts) {
      for (const id of c.ids) {
        const side = sideOf.get(id);
        if (!side || !ids.has(id)) continue;
        if (!firstOf.has(id)) firstOf.set(id, c.tick);
        if (!teamFirst.has(side)) teamFirst.set(side, id);
      }
    }
    for (const [id, tick] of firstOf) {
      const a = acc(id, sideOf.get(id)!);
      a.contactTimes.push(since(tick));
      a.profile.contactRounds = (a.profile.contactRounds ?? 0) + 1;
    }
    for (const [side, id] of teamFirst) acc(id, side).profile.firstContacts++;

    const died = new Map<string, number>();
    for (const k of (killsBy.get(round.number) ?? []).sort((a, b) => a.tick - b.tick)) {
      const side = sideOf.get(k.victimSteamId);
      if (!side || !ids.has(k.victimSteamId) || died.has(k.victimSteamId)) continue;
      died.set(k.victimSteamId, k.tick);
      acc(k.victimSteamId, side).deathTimes.push(since(k.tick));
    }

    if (round.frames.length > 0) sampleFrames(round, freezeEnd, kills[0]?.tick ?? null, firstOf, died);
  }

  function sampleFrames(
    round: TacticsRound,
    freezeEnd: number,
    firstKill: number | null,
    contacted: Map<string, number>,
    died: Map<string, number>
  ) {
    // Team spacing before the first kill: nearest alive teammate, every SPACING_STEP_S.
    const until = Math.min(firstKill ?? Infinity, freezeEnd + SPACING_WINDOW_S * tickRate, round.endTick);
    for (let tick = freezeEnd; tick <= until; tick += SPACING_STEP_S * tickRate) {
      const f = frameAt(round.frames, tick);
      if (!f) break;
      const alive = f.players.filter((p) => p.isAlive && ids.has(p.steamId));
      for (const p of alive) {
        let nearest = Infinity;
        for (const q of alive) if (q !== p && q.team === p.team) nearest = Math.min(nearest, dist(p, q));
        if (Number.isFinite(nearest)) acc(p.steamId, p.team).distances.push(nearest);
      }
    }
    // Setup spot.
    const at = freezeEnd + ANCHOR_DELAY_S * tickRate;
    if (at > round.endTick) return;
    const f = frameAt(round.frames, at);
    if (!f || Math.abs(f.tick - at) > tickRate) return;
    for (const p of f.players) {
      if (!p.isAlive || !ids.has(p.steamId)) continue;
      const prof = acc(p.steamId, p.team).profile;
      prof.spotRounds++;
      if (onSite(p)) prof.siteRounds++;
      prof.spots.push([snap(p.x), snap(p.y), snap(p.z)]);

      // S31: callout, zone, isolation and the round's path.
      const place = opts.placeOf?.(p) ?? null;
      const zone = zoneOf(p, place, zoneSites);
      let nearest = Infinity;
      for (const q of f.players) {
        if (q !== p && q.isAlive && q.team === p.team && ids.has(q.steamId)) nearest = Math.min(nearest, dist(p, q));
      }
      const isolated = nearest >= ISOLATED_RANGE;
      const deathTick = died.get(p.steamId) ?? null;
      const { path, rotated } = roundPath(round, p.steamId, freezeEnd, deathTick, zone);
      if (zone) prof.zones![zone]++;
      if (place ? MID_PLACE.test(place) : zone === "mid") prof.midRounds!++;
      if (isolated) prof.isolatedRounds!++;
      if (rotated) prof.rotations!++;
      prof.roundSpots!.push({
        round: round.number,
        place,
        zone,
        path,
        isolated,
        contact: contacted.has(p.steamId),
        rotated,
        diedS: deathTick == null ? null : r1(Math.max(0, (deathTick - freezeEnd) / tickRate)),
      });
    }
  }

  /** Callouts the player went through, and whether they reached another site than their setup zone. */
  function roundPath(
    round: TacticsRound,
    steamId: string,
    freezeEnd: number,
    deathTick: number | null,
    setupZone: Zone | null
  ): { path: string[]; rotated: boolean } {
    const path: string[] = [];
    let rotated = false;
    const until = Math.min(deathTick ?? Infinity, round.endTick, freezeEnd + PATH_WINDOW_S * tickRate);
    const setupAt = freezeEnd + ANCHOR_DELAY_S * tickRate;
    for (let tick = freezeEnd; tick <= until; tick += PATH_STEP_S * tickRate) {
      const f = frameAt(round.frames, tick);
      if (!f) break;
      const p = f.players.find((q) => q.steamId === steamId);
      if (!p || !p.isAlive) break;
      const place = opts.placeOf?.(p) ?? null;
      if (place && path.at(-1) !== place && path.length < PATH_MAX) path.push(place);
      if (tick > setupAt && setupZone && !rotated) {
        const zone = zoneOf(p, place, zoneSites);
        if (zone && zone !== "mid" && zone !== setupZone) rotated = true;
      }
    }
    return { path, rotated };
  }

  for (const a of accs.values()) {
    a.profile.contactTimeS = r1(median(a.contactTimes));
    a.profile.deathTimeS = r1(median(a.deathTimes));
    const d = median(a.distances);
    a.profile.teamDistance = d == null ? null : Math.round(d);
  }

  // Roles per team and side.
  const sideRole = new Map<string, Role | null>();
  for (const side of ["T", "CT"] as Side[]) {
    for (const team of ["CT", "T"] as Side[]) {
      const members = input.players
        .filter((p) => p.team === team)
        .map((p) => ({ id: p.steamId, prof: accs.get(`${p.steamId}|${side}`)?.profile }))
        .filter((m): m is { id: string; prof: SideProfile } => m.prof != null && m.prof.rounds >= MIN_SIDE_ROUNDS);
      for (const [id, role] of assignTeamRoles(side, members)) sideRole.set(`${id}|${side}`, role);
    }
  }

  return input.players.map((p) => {
    const sides: PlayerRoles["sides"] = {};
    for (const side of ["T", "CT"] as Side[]) {
      const a = accs.get(`${p.steamId}|${side}`);
      if (a) sides[side] = { role: sideRole.get(`${p.steamId}|${side}`) ?? null, profile: a.profile };
    }
    return { steamId: p.steamId, role: matchRole(sides), sides };
  });
}

/** Roles of one team's players on one side (players with too few rounds get none). */
export function assignTeamRoles(side: Side, members: Array<{ id: string; prof: SideProfile }>): Map<string, Role> {
  const out = new Map<string, Role>();
  const share = (n: number, of: number) => (of > 0 ? n / of : 0);

  const awper = [...members]
    .filter((m) => m.prof.awpKills >= AWP_MIN_KILLS && share(m.prof.awpKills, m.prof.kills) >= AWP_SHARE)
    .sort((a, b) => share(b.prof.awpKills, b.prof.kills) - share(a.prof.awpKills, a.prof.kills) || b.prof.awpKills - a.prof.awpKills)[0];
  if (awper) out.set(awper.id, "awp");
  const rest = members.filter((m) => !out.has(m.id));

  if (side === "T") {
    const entry = [...rest]
      .filter((m) => share(m.prof.firstContacts, m.prof.rounds) >= ENTRY_SHARE)
      .sort(
        (a, b) =>
          share(b.prof.firstContacts, b.prof.rounds) - share(a.prof.firstContacts, a.prof.rounds) ||
          (a.prof.contactTimeS ?? Infinity) - (b.prof.contactTimeS ?? Infinity)
      )[0];
    if (entry) out.set(entry.id, "entry");
    const lurk = rest
      .filter((m) => !out.has(m.id) && (m.prof.teamDistance ?? 0) >= LURK_DISTANCE)
      .sort((a, b) => (b.prof.teamDistance ?? 0) - (a.prof.teamDistance ?? 0))[0];
    if (lurk) out.set(lurk.id, "lurk");
  } else {
    for (const m of rest) {
      const p = m.prof;
      if (p.spotRounds < MIN_SIDE_ROUNDS / 2) continue;
      if (share(p.siteRounds, p.spotRounds) >= ANCHOR_SHARE) out.set(m.id, "anchor");
      else if (share(p.midRounds ?? 0, p.spotRounds) >= MID_SHARE) out.set(m.id, "mid");
      else if (
        share(p.zones?.mid ?? 0, p.spotRounds) >= MID_SHARE ||
        share(p.rotations ?? 0, p.spotRounds) >= ROTATOR_SHARE
      ) {
        out.set(m.id, "rotator");
      }
    }
  }
  for (const m of members) if (!out.has(m.id)) out.set(m.id, "support");
  return out;
}

/** The one role a match is summed up with. */
export function matchRole(sides: Partial<Record<Side, { role: Role | null; profile?: SideProfile }>>): Role | null {
  const t = sides.T?.role ?? null;
  const ct = sides.CT?.role ?? null;
  if (t === "awp" || ct === "awp") return "awp";
  if (t === "entry" || t === "lurk") return t;
  if (ct === "anchor" || ct === "rotator" || ct === "mid") return ct;
  return t ?? ct;
}

/** The site a CT anchored most (from the setup zones), or null. */
export function anchorSite(p: SideProfile | null | undefined): "A" | "B" | null {
  const z = p?.zones;
  if (!z || z.A + z.B === 0) return null;
  return z.A >= z.B ? "A" : "B";
}
