/**
 * Determine the player's actual in-game side at a given round.
 * MatchPlayer.team stores the second-half side (parser convention; see
 * src/lib/parsers/demo-parser.ts). Round 1-12: opposite. Round > 12: same.
 *
 * NOTE: OT side swaps every 3 rounds (rounds 25+) are NOT modeled here;
 * everything past round 12 is treated as the second-half side. Matches the
 * existing convention in scripts/debug-heatmap.ts.
 */
export function playerSideAtRound(
  matchPlayerTeam: "CT" | "T",
  roundNumber: number
): "CT" | "T" {
  if (roundNumber <= 12) {
    return matchPlayerTeam === "CT" ? "T" : "CT";
  }
  return matchPlayerTeam;
}
