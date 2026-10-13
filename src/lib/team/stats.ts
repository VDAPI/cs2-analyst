/**
 * Team dashboard numbers (S17): what the team does together across its
 * matches — record, maps, sides, pistols, post-plant and retakes, trades,
 * every roster player's line and the team's most common mistakes.
 *
 * Sides are per round (CLAUDE.md): the team's side in a round comes from
 * `createSideResolver(rounds)` (stored winner + score deltas), never from
 * "rounds ≤ 12 are swapped".
 *
 * Pure module (no DB), covered by `npm run test:team`.
 */
import { createSideResolver, type Side } from "@/lib/utils/sideSplit";
import type { FinalSide } from "./roster";

export interface TeamRoundInput {
  number: number;
  winner: string;
  ctScore: number;
  tScore: number;
  /** A bomb was planted this round (always by the round's T side). */
  planted: boolean;
}

export interface TeamPlayerLine {
  steamId: string;
  name: string;
  team: FinalSide;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  hltvRating: number;
  firstKills: number;
  firstDeaths: number;
  clutchWins: number;
  clutchAttempts: number;
  utilityDamage: number;
  flashAssists: number;
}

export interface TeamTradeLine {
  steamId: string;
  deaths: number;
  tradedDeaths: number;
  tradeChances: number;
  tradesMade: number;
}

export interface TeamFindingRow {
  steamId: string;
  type: string;
  category: string;
  severity: string;
}

export interface TeamMatchInput {
  matchId: string;
  map: string;
  date: string;
  /** Side the team finished on (= its score column). */
  teamSide: FinalSide;
  scoreCT: number;
  scoreT: number;
  rounds: TeamRoundInput[];
  players: TeamPlayerLine[];
  trades: TeamTradeLine[];
  findings: TeamFindingRow[];
}

export interface Record2 {
  played: number;
  won: number;
}

export interface TeamMapLine {
  map: string;
  matches: number;
  wins: number;
  losses: number;
  rounds: Record2;
  ct: Record2;
  t: Record2;
  pistols: Record2;
}

export interface TeamPlayerSummary {
  steamId: string;
  name: string;
  matches: number;
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  /** Per-round averages weighted by rounds played. */
  adr: number;
  rating: number;
  firstKills: number;
  firstDeaths: number;
  clutchWins: number;
  clutchAttempts: number;
  utilityDamage: number;
  flashAssists: number;
  deathsTraded: Record2;
}

export interface TeamFindingSummary {
  type: string;
  category: string;
  count: number;
  high: number;
  /** Per 10 rounds the team played. */
  per10: number;
  /** Players with the most of this type, most first. */
  players: Array<{ steamId: string; count: number }>;
}

export interface TeamRecentMatch {
  matchId: string;
  map: string;
  date: string;
  own: number;
  opp: number;
  result: "W" | "L" | "D";
}

export interface TeamDashboard {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  rounds: Record2;
  ct: Record2;
  t: Record2;
  pistols: Record2;
  /** Rounds the team planted as T / rounds the enemy planted on the team's CT side. */
  postPlant: Record2;
  retakes: Record2;
  /** First kills vs first deaths of the round, whole team. */
  openings: { kills: number; deaths: number };
  trades: { deaths: number; traded: number; chances: number; made: number };
  maps: TeamMapLine[];
  players: TeamPlayerSummary[];
  findings: TeamFindingSummary[];
  recent: TeamRecentMatch[];
}

const rec = (): Record2 => ({ played: 0, won: 0 });
const add = (r: Record2, won: boolean) => {
  r.played++;
  if (won) r.won++;
};

/** Pistol rounds: the first round of each regulation half. */
export const isPistolRound = (n: number) => n === 1 || n === 13;

export function buildTeamDashboard(
  input: TeamMatchInput[],
  roster: string[],
): TeamDashboard {
  const rosterSet = new Set(roster);
  const out: TeamDashboard = {
    matches: input.length,
    wins: 0,
    losses: 0,
    draws: 0,
    rounds: rec(),
    ct: rec(),
    t: rec(),
    pistols: rec(),
    postPlant: rec(),
    retakes: rec(),
    openings: { kills: 0, deaths: 0 },
    trades: { deaths: 0, traded: 0, chances: 0, made: 0 },
    maps: [],
    players: [],
    findings: [],
    recent: [],
  };
  const maps = new Map<string, TeamMapLine>();
  const players = new Map<string, TeamPlayerSummary>();
  const findings = new Map<
    string,
    TeamFindingSummary & { by: Map<string, number> }
  >();

  const sorted = [...input].sort((a, b) => b.date.localeCompare(a.date));
  for (const m of sorted) {
    const own = m.teamSide === "CT" ? m.scoreCT : m.scoreT;
    const opp = m.teamSide === "CT" ? m.scoreT : m.scoreCT;
    const result = own > opp ? "W" : own < opp ? "L" : "D";
    if (result === "W") out.wins++;
    else if (result === "L") out.losses++;
    else out.draws++;
    out.recent.push({
      matchId: m.matchId,
      map: m.map,
      date: m.date,
      own,
      opp,
      result,
    });

    const line =
      maps.get(m.map) ??
      ({
        map: m.map,
        matches: 0,
        wins: 0,
        losses: 0,
        rounds: rec(),
        ct: rec(),
        t: rec(),
        pistols: rec(),
      } satisfies TeamMapLine);
    maps.set(m.map, line);
    line.matches++;
    if (result === "W") line.wins++;
    if (result === "L") line.losses++;

    const sideOf = createSideResolver(m.rounds);
    for (const r of m.rounds) {
      if (r.winner !== "CT" && r.winner !== "T") continue;
      const side: Side = sideOf(m.teamSide, r.number);
      const won = r.winner === side;
      add(out.rounds, won);
      add(line.rounds, won);
      add(side === "CT" ? out.ct : out.t, won);
      add(side === "CT" ? line.ct : line.t, won);
      if (isPistolRound(r.number)) {
        add(out.pistols, won);
        add(line.pistols, won);
      }
      if (r.planted) add(side === "T" ? out.postPlant : out.retakes, won);
    }
    const roundsPlayed = m.rounds.length;

    for (const p of m.players) {
      if (!rosterSet.has(p.steamId) || p.team !== m.teamSide) continue;
      const s =
        players.get(p.steamId) ??
        ({
          steamId: p.steamId,
          name: p.name,
          matches: 0,
          rounds: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          adr: 0,
          rating: 0,
          firstKills: 0,
          firstDeaths: 0,
          clutchWins: 0,
          clutchAttempts: 0,
          utilityDamage: 0,
          flashAssists: 0,
          deathsTraded: rec(),
        } satisfies TeamPlayerSummary);
      players.set(p.steamId, s);
      // Newest match first: keep the latest name.
      s.matches++;
      // adr / rating are stored per match; weight them by rounds, divided at the end.
      s.adr += p.adr * roundsPlayed;
      s.rating += p.hltvRating * roundsPlayed;
      s.rounds += roundsPlayed;
      s.kills += p.kills;
      s.deaths += p.deaths;
      s.assists += p.assists;
      s.firstKills += p.firstKills;
      s.firstDeaths += p.firstDeaths;
      s.clutchWins += p.clutchWins;
      s.clutchAttempts += p.clutchAttempts;
      s.utilityDamage += p.utilityDamage;
      s.flashAssists += p.flashAssists;
    }
    // Openings of the whole side, the same players as the trades below.
    for (const p of m.players) {
      if (p.team !== m.teamSide) continue;
      out.openings.kills += p.firstKills;
      out.openings.deaths += p.firstDeaths;
    }

    const ours = new Set(
      m.players.filter((p) => p.team === m.teamSide).map((p) => p.steamId),
    );
    for (const tr of m.trades) {
      if (!ours.has(tr.steamId)) continue;
      out.trades.deaths += tr.deaths;
      out.trades.traded += tr.tradedDeaths;
      out.trades.chances += tr.tradeChances;
      out.trades.made += tr.tradesMade;
      const s = players.get(tr.steamId);
      if (s) {
        s.deathsTraded.played += tr.deaths;
        s.deathsTraded.won += tr.tradedDeaths;
      }
    }

    for (const f of m.findings) {
      if (!rosterSet.has(f.steamId) || !ours.has(f.steamId)) continue;
      const row = findings.get(f.type) ?? {
        type: f.type,
        category: f.category,
        count: 0,
        high: 0,
        per10: 0,
        players: [],
        by: new Map<string, number>(),
      };
      findings.set(f.type, row);
      row.count++;
      if (f.severity === "high") row.high++;
      row.by.set(f.steamId, (row.by.get(f.steamId) ?? 0) + 1);
    }
  }

  out.maps = [...maps.values()].sort(
    (a, b) => b.matches - a.matches || a.map.localeCompare(b.map),
  );
  out.players = [...players.values()]
    .map((s) => ({
      ...s,
      adr: s.rounds ? Math.round((s.adr / s.rounds) * 10) / 10 : 0,
      rating: s.rounds ? Math.round((s.rating / s.rounds) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.rating - a.rating || b.matches - a.matches);
  const teamRounds = Math.max(1, out.rounds.played);
  out.findings = [...findings.values()]
    .map(({ by, ...row }) => ({
      ...row,
      per10: Math.round((row.count / teamRounds) * 100) / 10,
      players: [...by.entries()]
        .map(([steamId, count]) => ({ steamId, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort(
      (a, b) =>
        b.count - a.count || b.high - a.high || a.type.localeCompare(b.type),
    );
  return out;
}

/** Share in percent (0–100), null without samples. */
export const pct = (r: Record2): number | null =>
  r.played > 0 ? Math.round((r.won / r.played) * 100) : null;
