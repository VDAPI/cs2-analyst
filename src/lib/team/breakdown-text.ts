/**
 * Written team breakdown of one demo (match → "Team analysis"): sentences
 * built from the anti-strat report's per-round facts, shared by the page and
 * its CSV download. Callouts, CT positions and T lanes use the players' names
 * for the map (src/lib/team/map-lanes.ts): "Split A: 3 Con, 2 Rampa",
 * "B: x · Short: y · Window: z · Con: v · A: w".
 */
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import type { AntiStratReport, BuyKind, RoundBreakdown } from "./antistrat";
import { DEFAULT_PROBE_S, EXECUTE_UTILITY_S, LATE_HIT_S } from "./antistrat";
import { ctSpotOf, laneOf, mapLanes, shortPlace } from "./map-lanes";

/** Competitive round time (1:55) and bomb timer (0:40), seconds. */
export const ROUND_TIME_S = 115;
export const BOMB_TIME_S = 40;

const mss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * The in-game clock at `s` seconds after freeze end: round time counting
 * down from 1:55, or "C4 0:31" on the bomb timer after the plant.
 */
export function roundClock(s: number, plantS: number | null = null): string {
  if (plantS != null && s >= plantS) return `C4 ${mss(Math.max(0, BOMB_TIME_S - (s - plantS)))}`;
  return mss(Math.max(0, ROUND_TIME_S - s));
}

/** A single-lane hit this fast is a rush. */
export const RUSH_S = 20;
/** Utility thrown for a single-lane hit that makes it an execute. */
export const EXEC_UTILITY = 3;

export const UTIL_KEY: Record<string, MessageKey> = {
  SMOKE: "antistrat.utilSmoke",
  FLASH: "antistrat.utilFlash",
  MOLOTOV: "antistrat.utilMolotov",
  HE: "antistrat.utilHe",
  DECOY: "antistrat.utilDecoy",
};
export const PACE_KEY: Record<string, MessageKey> = {
  fast: "antistrat.paceFast",
  default: "antistrat.paceDefault",
  late: "antistrat.paceLate",
};
export const BUY_KEY: Record<BuyKind, MessageKey> = {
  pistol: "antistrat.buyPistol",
  eco: "antistrat.buyEco",
  force: "antistrat.buyForce",
  full: "antistrat.buyFull",
};

export const utilName = (t: TFunction, type: string) => t(UTIL_KEY[type] ?? "antistrat.utilSmoke");

export type NameOf = (steamId: string) => string;

export function namesFromReport(report: AntiStratReport): NameOf {
  const m = new Map(report.players.map((p) => [p.steamId, p.name]));
  return (id) => m.get(id) ?? id;
}

/** The map's CT positions in display order; undefined without a table. */
const ctOrder = (map: string) => {
  const spots = mapLanes(map)?.ctSpots.map((s) => s.name);
  return spots?.length ? spots : undefined;
};

export const reportMap = (report: AntiStratReport) => report.matches[0]?.map ?? "";

/** Groups of names under a label, biggest first: [["Con", ["a", "b"]], …]. */
function grouped(entries: Array<[label: string, name: string]>, order?: string[]): Array<[string, string[]]> {
  const g = new Map<string, string[]>();
  for (const [label, name] of entries) g.set(label, [...(g.get(label) ?? []), name]);
  return [...g.entries()].sort((a, b) =>
    order ? order.indexOf(a[0]) - order.indexOf(b[0]) || b[1].length - a[1].length : b[1].length - a[1].length
  );
}

interface TPlay {
  /** "Split A", "Exec B", "Rush A", "Default → Exec A", "Default bez wejścia". */
  name: string;
  /** Players per lane into the site, then the rest by where they were. */
  groups: string[];
  /** Lane composition, biggest first: [["Con", 3], ["Rampa", 2]] (empty without a hit). */
  lanes: Array<[string, number]>;
}

/** What a T round was, from the routes: split, execute, rush or default. */
function tPlay(t: TFunction, map: string, r: RoundBreakdown, nameOf: NameOf): TPlay {
  const site = r.site;
  if (!site || r.hitS == null) {
    const rest = grouped(r.paths.map((p) => [shortPlace(map, p.path[p.path.length - 1] ?? "?"), nameOf(p.steamId)]));
    return {
      name: t("teamDemo.tacticNoHit"),
      groups: rest.map(([place, names]) => t("teamDemo.groupRest", { place, names: names.join(", ") })),
      lanes: [],
    };
  }
  const lanes: Array<[string, string]> = [];
  const rest: Array<[string, string]> = [];
  for (const p of r.paths) {
    const lane = laneOf(map, site, p.path);
    const last = shortPlace(map, p.path[p.path.length - 1] ?? "?");
    if (p.onSite || (lane && lane !== "Mid")) lanes.push([lane ?? last, nameOf(p.steamId)]);
    else rest.push([r.lurkers.includes(p.steamId) ? `lurk ${last}` : last, nameOf(p.steamId)]);
  }
  const byLane = grouped(lanes);
  const realLanes = byLane.filter(([l]) => l !== "Mid");
  const hitUtility = r.thrown.filter((g) => g.s >= r.hitS! - EXECUTE_UTILITY_S && g.s <= r.hitS! + 3).length;
  let name =
    r.hitS <= RUSH_S
      ? t("teamDemo.tacticRush", { site })
      : realLanes.length >= 2
        ? t("teamDemo.tacticSplit", { site })
        : hitUtility >= EXEC_UTILITY
          ? t("teamDemo.tacticExec", { site })
          : t("teamDemo.tacticHit", { site });
  if (r.hitS > LATE_HIT_S) name = t("teamDemo.tacticLate", { name });
  return {
    name,
    groups: [
      ...byLane.map(([lane, names]) => t("teamDemo.group", { n: names.length, lane, names: names.join(", ") })),
      ...grouped(rest).map(([place, names]) => t("teamDemo.groupRest", { place, names: names.join(", ") })),
    ],
    lanes: byLane.map(([lane, names]) => [lane, names.length]),
  };
}

export interface RepeatedPlay {
  /** "Split A · Con + Rampa" (the lanes, alphabetical). */
  label: string;
  rounds: number;
  wins: number;
  /** Grenades thrown in most of these rounds: "Smoke Window (3/4)". */
  utility: string[];
  examples: RoundBreakdown[];
}

/**
 * The team's plays that came back: T rounds with the same tactic and the
 * same lane split (e.g. "Split A · 3 Con + 2 Rampa"), at least twice, with
 * the grenades they usually go with. Over every demo of the report.
 */
export function repeatedPlays(t: TFunction, report: AntiStratReport): RepeatedPlay[] {
  const map = reportMap(report);
  const nameOf = namesFromReport(report);
  const groups = new Map<string, RoundBreakdown[]>();
  for (const r of report.rounds) {
    if (r.side !== "T") continue;
    const play = tPlay(t, map, r, nameOf);
    // Same tactic through the same lanes; how many go each way varies round to round.
    const label = play.lanes.length
      ? `${play.name} · ${play.lanes
          .map(([l]) => l)
          .sort()
          .join(" + ")}`
      : play.name;
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups.entries()]
    .filter(([, rounds]) => rounds.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, rounds]) => {
      const util = new Map<string, number>();
      for (const r of rounds)
        for (const k of new Set(r.thrown.map((g) => `${utilName(t, g.type)} ${shortPlace(map, g.place)}`))) util.set(k, (util.get(k) ?? 0) + 1);
      return {
        label,
        rounds: rounds.length,
        wins: rounds.filter((r) => r.won).length,
        utility: [...util.entries()]
          .filter(([, n]) => n * 2 >= rounds.length)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, n]) => `${k} (${n}/${rounds.length})`),
        examples: rounds.slice(0, 4),
      };
    });
}

/** CT players per position, in the map's order; players off the usual spots as pushes. */
function ctGroups(t: TFunction, map: string, r: RoundBreakdown, nameOf: NameOf): string[] {
  const order = ctOrder(map);
  const spots: Array<[string, string]> = [];
  const pushes: Array<[string, string]> = [];
  for (const p of r.positions) {
    const spot = order ? ctSpotOf(map, p.place) : shortPlace(map, p.place);
    if (spot) spots.push([spot, nameOf(p.steamId)]);
    else pushes.push([shortPlace(map, p.place), nameOf(p.steamId)]);
  }
  return [
    ...grouped(spots, order).map(([spot, names]) => t("teamDemo.groupRest", { place: spot, names: names.join(", ") })),
    ...grouped(pushes).map(([place, names]) => t("teamDemo.ctAggroSpot", { place, names: names.join(", ") })),
  ];
}

export interface RoundText {
  /** Tactic name on T ("Split A"), "Obrona" on CT. */
  name: string;
  /** Who went where (T lanes / CT positions). */
  groups: string[];
  /** Plant / retake / first contacts, one line. */
  outcome: string;
}

export function roundText(t: TFunction, map: string, r: RoundBreakdown, nameOf: NameOf): RoundText {
  if (r.side === "T") {
    const play = tPlay(t, map, r, nameOf);
    const outcome =
      r.hitS == null
        ? ""
        : r.planted
          ? t("teamDemo.plantAt", { clock: roundClock(r.hitS) })
          : t("teamDemo.hitAt", { clock: roundClock(r.hitS) });
    return { ...play, outcome };
  }
  const parts: string[] = [];
  if (r.aggression.length > 0) {
    parts.push(
      t("teamDemo.ctKills", {
        list: r.aggression.map((a) => `${a.kill ? "+" : "−"} ${shortPlace(map, a.place)}`).join(", "),
      })
    );
  }
  if (r.retake) parts.push(r.retake.saved ? t("teamDemo.ctSaved") : t("teamDemo.ctRetake", { n: r.retake.alive }));
  return {
    name: t("teamDemo.tacticCt"),
    groups: r.positions.length ? ctGroups(t, map, r, nameOf) : [t("teamDemo.noPositions")],
    outcome: parts.join(" · "),
  };
}

/** Every grenade of the round in throw order: "Smoke: z Top Mid na Con (k1ttt, 1:32)". */
export function thrownText(t: TFunction, map: string, r: RoundBreakdown, nameOf: NameOf): string {
  if (r.thrown.length === 0) return t("teamDemo.none");
  const plantS = r.planted ? r.hitS : null;
  return r.thrown
    .map((g) => {
      const vars = {
        type: utilName(t, g.type),
        place: shortPlace(map, g.place),
        name: nameOf(g.by),
        clock: roundClock(g.s, plantS),
      };
      return g.from ? t("teamDemo.utilFromTo", { ...vars, from: shortPlace(map, g.from) }) : t("teamDemo.utilBy", vars);
    })
    .join(", ");
}

/** Most thrown grenades (type + landing spot) on one side. */
export function topUtility(map: string, rounds: RoundBreakdown[], n: number): Array<{ type: string; place: string; count: number }> {
  const c = new Map<string, number>();
  for (const r of rounds)
    for (const g of r.thrown) {
      const k = `${g.type}|${shortPlace(map, g.place)}`;
      c.set(k, (c.get(k) ?? 0) + 1);
    }
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, count]) => {
      const [type, place] = k.split("|");
      return { type, place, count };
    });
}

/** Callouts at the default probe merged under the map's short names (rounds with someone there). */
export function defaultSpots(map: string, rounds: RoundBreakdown[]): Array<{ place: string; rounds: number }> {
  const c = new Map<string, number>();
  for (const r of rounds) for (const place of new Set(r.positions.map((p) => shortPlace(map, p.place)))) c.set(place, (c.get(place) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([place, n]) => ({ place, rounds: n }));
}

/** Tactic names of the T rounds with counts: [["Split A", 3], …]. */
export function tacticCounts(t: TFunction, report: AntiStratReport): Array<[string, number]> {
  const map = reportMap(report);
  const nameOf = namesFromReport(report);
  const c = new Map<string, number>();
  for (const r of report.rounds) {
    if (r.side !== "T") continue;
    const name = tPlay(t, map, r, nameOf).name;
    c.set(name, (c.get(name) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

/** Pistol rounds over every demo: T tactics and CT setups with counts. */
export function pistolLines(t: TFunction, report: AntiStratReport): string[] {
  const map = reportMap(report);
  const nameOf = namesFromReport(report);
  const pistols = report.rounds.filter((r) => r.buy === "pistol");
  const count = (keys: string[]) => {
    const c = new Map<string, number>();
    for (const k of keys) c.set(k, (c.get(k) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(", ");
  };
  const out: string[] = [];
  const tp = pistols.filter((r) => r.side === "T");
  if (tp.length > 0) {
    out.push(
      t("teamDemo.summaryPistolT", {
        list: count(tp.map((r) => tPlay(t, map, r, nameOf).name)),
        won: tp.filter((r) => r.won).length,
        of: tp.length,
      })
    );
  }
  const cp = pistols.filter((r) => r.side === "CT");
  if (cp.length > 0) {
    out.push(
      t("teamDemo.summaryPistolCt", {
        list: count(cp.map((r) => ctSetupKey(map, r) ?? t("teamDemo.noPositions"))),
        won: cp.filter((r) => r.won).length,
        of: cp.length,
      })
    );
  }
  return out;
}

/** CT setup as players per position, e.g. "B 2 · Short 1 · Window 1 · A 1". */
function ctSetupKey(map: string, r: RoundBreakdown): string | null {
  const order = ctOrder(map);
  if (!order || r.positions.length < 3) return null;
  const n = new Map<string, number>();
  for (const p of r.positions) {
    const spot = ctSpotOf(map, p.place);
    if (spot) n.set(spot, (n.get(spot) ?? 0) + 1);
  }
  return order
    .filter((s) => n.has(s))
    .map((s) => `${s} ${n.get(s)}`)
    .join(" · ");
}

/** Each CT player's most common position: "imap B (8/12)". */
function ctPlayerSpots(map: string, report: AntiStratReport): string[] {
  const nameOf = namesFromReport(report);
  const per = new Map<string, Map<string, number>>();
  let rounds = 0;
  for (const r of report.rounds) {
    if (r.side !== "CT") continue;
    rounds++;
    for (const p of r.positions) {
      const spot = ctSpotOf(map, p.place) ?? shortPlace(map, p.place);
      const m = per.get(p.steamId) ?? new Map<string, number>();
      m.set(spot, (m.get(spot) ?? 0) + 1);
      per.set(p.steamId, m);
    }
  }
  return [...per.entries()].map(([id, m]) => {
    const [spot, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return `${nameOf(id)} ${spot} (${n}/${rounds})`;
  });
}

/** The "Key points" sentences: result, tactics, T default, CT setup and positions, utility. */
export function summaryLines(t: TFunction, report: AntiStratReport): string[] {
  const map = reportMap(report);
  const stats = report.maps[0];
  const match = report.matches[0];
  if (!stats || !match) return [];
  const won = report.matches.filter((m) => m.rivalScore > m.oppScore).length;
  const out: string[] = [
    report.matches.length > 1
      ? t("teamDemo.summaryMatches", {
          n: report.matches.length,
          won,
          t: stats.t.wins,
          tOf: stats.t.rounds,
          ct: stats.ct.wins,
          ctOf: stats.ct.rounds,
        })
      : t("teamDemo.summaryResult", {
          score: `${match.rivalScore}:${match.oppScore}`,
          t: stats.t.wins,
          tOf: stats.t.rounds,
          ct: stats.ct.wins,
          ctOf: stats.ct.rounds,
        }),
  ];
  out.push(...pistolLines(t, report));
  const tactics = tacticCounts(t, report);
  if (tactics.length > 0) out.push(t("teamDemo.summaryTactics", { list: tactics.map(([n, c]) => `${n} ×${c}`).join(", ") }));
  const tRounds = report.rounds.filter((r) => r.side === "T");
  const defaults = defaultSpots(map, tRounds);
  if (defaults.length > 0) {
    out.push(
      t("teamDemo.summaryDefault", {
        s: DEFAULT_PROBE_S,
        list: defaults
          .slice(0, 5)
          .map((d) => `${d.place} ${d.rounds}/${tRounds.length}`)
          .join(", "),
      })
    );
  }
  const ctRounds = report.rounds.filter((r) => r.side === "CT");
  const setups = new Map<string, number>();
  for (const r of ctRounds) {
    const k = ctSetupKey(map, r);
    if (k) setups.set(k, (setups.get(k) ?? 0) + 1);
  }
  const top = [...setups.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) out.push(t("teamDemo.summaryCtSpots", { list: top[0], n: top[1], of: ctRounds.length }));
  const spots = ctPlayerSpots(map, report);
  if (spots.length > 0) out.push(t("teamDemo.summaryCtPlayers", { list: spots.join(", ") }));
  for (const side of ["T", "CT"] as const) {
    const util = topUtility(
      map,
      report.rounds.filter((r) => r.side === side),
      4
    );
    if (util.length === 0) continue;
    out.push(
      t(side === "T" ? "teamDemo.summaryUtilT" : "teamDemo.summaryUtilCt", {
        list: util.map((u) => t("teamDemo.utilCount", { type: utilName(t, u.type), place: u.place, n: u.count })).join(", "),
      })
    );
  }
  return out;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Round-by-round CSV (Excel opens it with the BOM; semicolons for Polish locales). */
export function roundsCsv(t: TFunction, report: AntiStratReport): string {
  const map = reportMap(report);
  const nameOf = namesFromReport(report);
  const head = [
    t("teamDemo.colRound"),
    t("teamDemo.colSide"),
    t("teamDemo.colBuy"),
    t("teamDemo.colResult"),
    t("teamDemo.colPlay"),
    t("teamDemo.colUtility"),
  ];
  const rows = report.rounds.map((r) => {
    const text = roundText(t, map, r, nameOf);
    return [
      r.round,
      r.side,
      t(BUY_KEY[r.buy]),
      r.won ? t("teamDemo.won") : t("teamDemo.lost"),
      [text.name, ...text.groups, text.outcome].filter(Boolean).join(" · "),
      thrownText(t, map, r, nameOf),
    ];
  });
  return "﻿" + [head, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
