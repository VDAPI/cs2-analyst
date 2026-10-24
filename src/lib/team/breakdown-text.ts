/**
 * Written team breakdown of one demo (match → "Team analysis"): sentences
 * built from the anti-strat report's per-round facts, shared by the page and
 * its CSV download.
 */
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import type { AntiStratReport, BuyKind, RoundBreakdown } from "./antistrat";
import { DEFAULT_PROBE_S } from "./antistrat";

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

/** "Default / setup positions" of one round, e.g. "s1mple Mid, b1t A Site". */
export function positionsText(t: TFunction, r: RoundBreakdown, nameOf: NameOf): string {
  if (r.positions.length === 0) return t("teamDemo.noPositions");
  return r.positions.map((p) => t("teamDemo.position", { name: nameOf(p.steamId), place: p.place })).join(", ");
}

/** What the team did in the round, in one sentence (without the buy and result). */
export function playText(t: TFunction, r: RoundBreakdown, nameOf: NameOf): string {
  const parts = [positionsText(t, r, nameOf)];
  if (r.side === "T") {
    parts.push(
      r.site && r.hitS != null
        ? t("teamDemo.tHit", {
            site: r.site,
            sec: Math.round(r.hitS),
            n: r.playersOnSite,
            plant: r.planted ? t("teamDemo.tPlanted") : "",
          })
        : t("teamDemo.tNoHit")
    );
    if (r.lurkers.length > 0) parts.push(t("teamDemo.tLurk", { names: r.lurkers.map(nameOf).join(", ") }));
  } else {
    if (r.setup) parts.push(t("teamDemo.ctSetup", { a: r.setup.A, mid: r.setup.mid, b: r.setup.B }));
    if (r.aggression.length > 0) {
      parts.push(
        t("teamDemo.ctAggro", {
          list: r.aggression.map((a) => `${a.kill ? "+" : "−"} ${a.place}`).join(", "),
        })
      );
    }
    if (r.retake) parts.push(r.retake.saved ? t("teamDemo.ctSaved") : t("teamDemo.ctRetake", { n: r.retake.alive }));
  }
  return parts.join(" · ");
}

/** Every grenade of the round in throw order, e.g. "Smoke Jungle (12 s), Flash A Site (18 s)". */
export function thrownText(t: TFunction, r: RoundBreakdown): string {
  if (r.thrown.length === 0) return t("teamDemo.none");
  return r.thrown.map((g) => t("teamDemo.utilEntry", { type: utilName(t, g.type), place: g.place, s: g.s })).join(", ");
}

/** Most thrown grenades (type + landing callout) on one side. */
export function topUtility(rounds: RoundBreakdown[], n: number): Array<{ type: string; place: string; count: number }> {
  const c = new Map<string, number>();
  for (const r of rounds) for (const g of r.thrown) c.set(`${g.type}|${g.place}`, (c.get(`${g.type}|${g.place}`) ?? 0) + 1);
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, count]) => {
      const [type, place] = k.split("|");
      return { type, place, count };
    });
}

/** The "Key points" sentences: result, T default, main hit, CT setup, utility. */
export function summaryLines(t: TFunction, report: AntiStratReport): string[] {
  const map = report.maps[0];
  const match = report.matches[0];
  if (!map || !match) return [];
  const out: string[] = [
    t("teamDemo.summaryResult", {
      score: `${match.rivalScore}:${match.oppScore}`,
      t: map.t.wins,
      tOf: map.t.rounds,
      ct: map.ct.wins,
      ctOf: map.ct.rounds,
    }),
  ];
  if (map.t.defaults.length > 0) {
    out.push(
      t("teamDemo.summaryDefault", {
        s: DEFAULT_PROBE_S,
        list: map.t.defaults
          .slice(0, 5)
          .map((d) => `${d.place} ${d.rounds}/${d.of}`)
          .join(", "),
      })
    );
  }
  const exec = map.t.executes[0];
  if (exec) {
    out.push(
      t("teamDemo.summaryExecute", {
        site: exec.site,
        pace: t(PACE_KEY[exec.pace]),
        sec: Math.round(exec.hitS),
        n: exec.rounds,
        of: map.t.rounds,
      })
    );
  }
  const setup = map.ct.setups[0];
  if (setup) {
    out.push(t("teamDemo.summarySetup", { a: setup.A, mid: setup.mid, b: setup.B, n: setup.rounds, of: map.ct.rounds }));
  }
  for (const side of ["T", "CT"] as const) {
    const top = topUtility(
      report.rounds.filter((r) => r.side === side),
      4
    );
    if (top.length === 0) continue;
    out.push(
      t(side === "T" ? "teamDemo.summaryUtilT" : "teamDemo.summaryUtilCt", {
        list: top.map((u) => t("teamDemo.utilCount", { type: utilName(t, u.type), place: u.place, n: u.count })).join(", "),
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
  const nameOf = namesFromReport(report);
  const head = [
    t("teamDemo.colRound"),
    t("teamDemo.colSide"),
    t("teamDemo.colBuy"),
    t("teamDemo.colResult"),
    t("teamDemo.colPlay"),
    t("teamDemo.colUtility"),
  ];
  const rows = report.rounds.map((r) => [
    r.round,
    r.side,
    t(BUY_KEY[r.buy]),
    r.won ? t("teamDemo.won") : t("teamDemo.lost"),
    playText(t, r, nameOf),
    thrownText(t, r),
  ]);
  return "﻿" + [head, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
