/**
 * Teams found in the player's team analysis demos (/team-analysis): every
 * demo has two lineups; lineups sharing at least SAME_TEAM_PLAYERS players
 * are one team, so a stand-in (or two) does not split it. The core roster is
 * the players who played most of that team's matches. Pure module.
 */

/** Players two lineups must share to be the same team. */
export const SAME_TEAM_PLAYERS = 3;
/** Core roster size shown and used for the analysis. */
export const CORE_SIZE = 5;

export interface Lineup {
  matchId: string;
  map: string;
  date: string;
  /** Side the lineup finished on (picks it in the match). */
  side: "CT" | "T";
  players: Array<{ steamId: string; name: string }>;
}

export interface DetectedTeam {
  /** Core roster, most matches first. */
  core: Array<{ steamId: string; name: string; matches: number }>;
  /** Players outside the core who played for them (stand-ins). */
  standIns: Array<{ steamId: string; name: string; matches: number }>;
  matches: number;
  maps: Array<{ map: string; matches: number }>;
  lastDate: string;
}

/** Stable URL key of a roster: its SteamIDs, sorted, comma-joined. */
export const rosterKey = (steamIds: string[]) => [...steamIds].sort().join(",");

export function detectTeams(lineups: Lineup[]): DetectedTeam[] {
  // Union-find over lineups.
  const parent = lineups.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const sets = lineups.map((l) => new Set(l.players.map((p) => p.steamId)));
  for (let i = 0; i < lineups.length; i++) {
    for (let j = i + 1; j < lineups.length; j++) {
      if (lineups[i].matchId === lineups[j].matchId) continue;
      let shared = 0;
      for (const id of sets[i]) if (sets[j].has(id)) shared++;
      if (shared >= SAME_TEAM_PLAYERS) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Lineup[]>();
  lineups.forEach((l, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), l]));

  const teams: DetectedTeam[] = [];
  for (const group of groups.values()) {
    const count = new Map<string, { steamId: string; name: string; matches: number }>();
    for (const l of group)
      for (const p of l.players) {
        const c = count.get(p.steamId) ?? { steamId: p.steamId, name: p.name, matches: 0 };
        c.matches++;
        c.name = p.name;
        count.set(p.steamId, c);
      }
    const ranked = [...count.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
    const maps = new Map<string, number>();
    for (const l of group) maps.set(l.map, (maps.get(l.map) ?? 0) + 1);
    teams.push({
      core: ranked.slice(0, CORE_SIZE),
      standIns: ranked.slice(CORE_SIZE),
      matches: group.length,
      maps: [...maps.entries()].sort((a, b) => b[1] - a[1]).map(([map, matches]) => ({ map, matches })),
      lastDate: group.map((l) => l.date).sort().at(-1) ?? "",
    });
  }
  return teams.sort((a, b) => b.matches - a.matches || b.lastDate.localeCompare(a.lastDate));
}
