/**
 * The two "compare" colors. Player 1 is violet, player 2 is lime — never the
 * CT/T colors, which are reserved for sides.
 */
export const PLAYER_COLORS = {
  p1: "var(--accent)",
  p2: "var(--accent-2)",
} as const;

export const PLAYER_MUTED = {
  p1: "var(--accent-muted)",
  p2: "var(--accent-2-muted)",
} as const;

/** "1 mecz", "3 mecze", "5 meczów" — Polish plural for matches. */
export function matchesLabel(n: number): string {
  if (n === 1) return `${n} mecz`;
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${n} mecze`;
  return `${n} meczów`;
}
