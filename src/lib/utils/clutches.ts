export type ClutchSize = 1 | 2 | 3 | 4 | 5;

export interface ClutchInputKill {
  tick: number;
  attackerSteamId: string;
  victimSteamId: string;
}

export interface ClutchInputRound {
  id: string;
  number: number;
  winner: "CT" | "T";
  kills: ClutchInputKill[];
}

export interface ClutchInput {
  rounds: ClutchInputRound[];
  teamBySteamId: Map<string, "CT" | "T">;
}

export interface Clutch {
  roundId: string;
  roundNumber: number;
  clutcherSteamId: string;
  clutcherTeam: "CT" | "T";
  size: ClutchSize;
  won: boolean;
}

export function detectClutches(input: ClutchInput): Clutch[] {
  const { rounds, teamBySteamId } = input;
  const results: Clutch[] = [];

  for (const round of rounds) {
    const aliveCT = new Set<string>();
    const aliveT = new Set<string>();
    for (const [steamId, team] of teamBySteamId) {
      if (team === "CT") aliveCT.add(steamId);
      else aliveT.add(steamId);
    }

    let captured = false;

    const sortedKills = [...round.kills].sort((a, b) => a.tick - b.tick);
    for (const kill of sortedKills) {
      const victimTeam = teamBySteamId.get(kill.victimSteamId);
      if (victimTeam === "CT") aliveCT.delete(kill.victimSteamId);
      else if (victimTeam === "T") aliveT.delete(kill.victimSteamId);

      if (captured) continue;

      const ctSize = aliveCT.size;
      const tSize = aliveT.size;

      let clutcher: string | null = null;
      let clutcherTeam: "CT" | "T" | null = null;
      let opponents = 0;

      if (ctSize === 1 && tSize >= 1) {
        clutcher = aliveCT.values().next().value ?? null;
        clutcherTeam = "CT";
        opponents = tSize;
      } else if (tSize === 1 && ctSize >= 1) {
        clutcher = aliveT.values().next().value ?? null;
        clutcherTeam = "T";
        opponents = ctSize;
      }

      if (clutcher && clutcherTeam && opponents >= 1 && opponents <= 5) {
        results.push({
          roundId: round.id,
          roundNumber: round.number,
          clutcherSteamId: clutcher,
          clutcherTeam,
          size: opponents as ClutchSize,
          won: clutcherTeam === round.winner,
        });
        captured = true;
      }
    }
  }

  return results;
}

export function clutchesByRoundId(clutches: Clutch[]): Map<string, Clutch> {
  const map = new Map<string, Clutch>();
  for (const c of clutches) map.set(c.roundId, c);
  return map;
}

export interface ClutchBySideInput {
  rounds: ClutchInputRound[];
  /** steamId → side the player FINISHED the match on (MatchPlayer.team / roster). */
  finalTeamBySteamId: Map<string, "CT" | "T">;
  /**
   * Side a player played in a round, from their end-of-match side
   * (see `createSideResolver` / `sideInRound` in sideSplit.ts).
   */
  sideAt: (finalSide: "CT" | "T", roundNumber: number) => "CT" | "T";
}

/**
 * detectClutches with per-round sides. `round.winner` is an absolute side, so
 * each round is checked against the side map actually in play that round (two
 * maps at most: as finished, or swapped). Using end-of-match sides verbatim
 * would invert won/lost in every round played on the other side.
 */
export function detectClutchesBySide({
  rounds,
  finalTeamBySteamId,
  sideAt,
}: ClutchBySideInput): Clutch[] {
  const asFinished: ClutchInputRound[] = [];
  const swapped: ClutchInputRound[] = [];
  for (const r of rounds) {
    if (sideAt("CT", r.number) === "CT") asFinished.push(r);
    else swapped.push(r);
  }
  const swappedTeams = new Map<string, "CT" | "T">();
  for (const [id, team] of finalTeamBySteamId) swappedTeams.set(id, team === "CT" ? "T" : "CT");

  return [
    ...detectClutches({ rounds: asFinished, teamBySteamId: finalTeamBySteamId }),
    ...detectClutches({ rounds: swapped, teamBySteamId: swappedTeams }),
  ].sort((a, b) => a.roundNumber - b.roundNumber);
}
