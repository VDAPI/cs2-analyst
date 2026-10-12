/**
 * Which side (CT/T) a player played in a given round.
 *
 * `MatchPlayer.team` (and the parser roster) stores the side a player
 * FINISHED the match on; `Round.winner` is an absolute side. Anything that
 * compares the two must resolve the side for that round first.
 *
 * Team identity convention used everywhere: "teamA" = the players who finished
 * on CT (their score is `Match.scoreCT` / `Round.ctScore`), "teamB" = the
 * players who finished on T.
 *
 * Sources, best first:
 *  1. the parser reads the live `team_num` per round (demo-parser.ts);
 *  2. pages infer teamA's side per round from the stored round winner and the
 *     cumulative teamA/teamB scores (`teamASidesFromScores`) — real data, so
 *     overtime, short (surrendered) matches and any side swap are handled;
 *  3. the MR12 + MR3-overtime rule (`ruleSideAtRound`) as the last fallback.
 */

export type Side = "CT" | "T";

export function otherSide(side: Side): Side {
  return side === "CT" ? "T" : "CT";
}

/** Regulation is MR12 (12 rounds a half); overtime halves are 3 rounds (MR3). */
const REG_HALF = 12;
const OT_HALF = 3;

/** 0 = rounds 1-12, 1 = 13-24, 2/3 = OT1 halves, 4/5 = OT2 halves, … */
export function halfIndex(roundNumber: number): number {
  if (roundNumber <= REG_HALF) return 0;
  if (roundNumber <= REG_HALF * 2) return 1;
  return 2 + Math.floor((roundNumber - REG_HALF * 2 - 1) / OT_HALF);
}

/**
 * Side swaps that happened before the given half. Sides swap at regulation
 * halftime and at every overtime halftime; going into an overtime the teams
 * keep the side they just played (CS2 default), so half 2 has the same side as
 * half 1, half 4 the same as half 3, and so on.
 */
function swapsBefore(half: number): number {
  return Math.floor((half + 1) / 2);
}

/**
 * Rule-based fallback: the side for `roundNumber` of a player who finished the
 * match (last round `lastRound`) on `finalSide`.
 */
export function ruleSideAtRound(finalSide: Side, roundNumber: number, lastRound: number): Side {
  const swaps =
    swapsBefore(halfIndex(Math.max(lastRound, roundNumber))) - swapsBefore(halfIndex(roundNumber));
  return swaps % 2 === 0 ? finalSide : otherSide(finalSide);
}

export interface ScoredRound {
  number: number;
  winner: string;
  /** Cumulative score of teamA (finished on CT) after this round. */
  ctScore: number;
  /** Cumulative score of teamB (finished on T) after this round. */
  tScore: number;
}

/**
 * teamA's side in every round, inferred from who scored the round: if teamA's
 * cumulative score went up, teamA played the winning side. Rounds whose scores
 * don't move by exactly one point fall back to the MR12/MR3 rule.
 */
export function teamASidesFromScores(rounds: ScoredRound[]): Map<number, Side> {
  const sorted = [...rounds].sort((a, b) => a.number - b.number);
  const lastRound = sorted.length ? sorted[sorted.length - 1].number : 0;
  const out = new Map<number, Side>();
  let prevA = 0;
  let prevB = 0;
  for (const r of sorted) {
    const winner = r.winner === "CT" || r.winner === "T" ? r.winner : null;
    const dA = r.ctScore - prevA;
    const dB = r.tScore - prevB;
    if (winner && dA === 1 && dB === 0) out.set(r.number, winner);
    else if (winner && dA === 0 && dB === 1) out.set(r.number, otherSide(winner));
    else out.set(r.number, ruleSideAtRound("CT", r.number, lastRound));
    prevA = r.ctScore;
    prevB = r.tScore;
  }
  return out;
}

/**
 * Side of a player in a round, given their end-of-match side and teamA's side
 * per round. Rounds missing from the map use the MR12/MR3 rule.
 */
export function sideInRound(
  finalSide: Side,
  roundNumber: number,
  teamASideByRound: ReadonlyMap<number, Side> | Readonly<Record<number, Side>>,
  lastRound: number
): Side {
  const teamASide =
    teamASideByRound instanceof Map
      ? teamASideByRound.get(roundNumber)
      : (teamASideByRound as Readonly<Record<number, Side>>)[roundNumber];
  if (!teamASide) return ruleSideAtRound(finalSide, roundNumber, lastRound);
  // teamA finished on CT. Same team as teamA → teamA's side, else the other.
  return finalSide === "CT" ? teamASide : otherSide(teamASide);
}

/** Resolver over a match's stored rounds: (end-of-match side, round) → side in that round. */
export function createSideResolver(rounds: ScoredRound[]): (finalSide: Side, roundNumber: number) => Side {
  const sides = teamASidesFromScores(rounds);
  const lastRound = rounds.reduce((m, r) => Math.max(m, r.number), 0);
  return (finalSide, roundNumber) => sideInRound(finalSide, roundNumber, sides, lastRound);
}

/**
 * Rule-only variant kept for callers without round data. Prefer
 * `createSideResolver` (real per-round data).
 */
export function playerSideAtRound(
  matchPlayerTeam: Side,
  roundNumber: number,
  lastRound = 24
): Side {
  return ruleSideAtRound(matchPlayerTeam, roundNumber, lastRound);
}
