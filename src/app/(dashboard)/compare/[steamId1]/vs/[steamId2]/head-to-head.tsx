import { Card, Badge, SectionTitle } from "@/components/ui";
import { PLAYER_COLORS, matchesLabel } from "../../../compare-ui";

interface HeadToHeadProps {
  player1Name: string;
  player2Name: string;
  p1KillsOnP2: number;
  p2KillsOnP1: number;
  sharedMatchCount: number;
}

export function HeadToHead({
  player1Name,
  player2Name,
  p1KillsOnP2,
  p2KillsOnP1,
  sharedMatchCount,
}: HeadToHeadProps) {
  const total = p1KillsOnP2 + p2KillsOnP1;
  const p1Pct = total > 0 ? (p1KillsOnP2 / total) * 100 : 50;

  return (
    <Card>
      <SectionTitle
        action={<Badge variant="neutral">{matchesLabel(sharedMatchCount)} wspólnie</Badge>}
      >
        Bezpośrednie starcia
      </SectionTitle>

      {/* Kill counts */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" style={{ color: PLAYER_COLORS.p1 }}>
            {player1Name}
          </p>
          <p className="stat-number mt-1" style={{ color: PLAYER_COLORS.p1 }}>
            {p1KillsOnP2}
          </p>
        </div>

        <p className="label-overline max-w-[7rem] pb-2 text-center leading-tight text-[var(--text-tertiary)]">
          zabójstwa nawzajem
        </p>

        <div className="min-w-0 text-right">
          <p className="truncate text-xs font-semibold" style={{ color: PLAYER_COLORS.p2 }}>
            {player2Name}
          </p>
          <p className="stat-number mt-1" style={{ color: PLAYER_COLORS.p2 }}>
            {p2KillsOnP1}
          </p>
        </div>
      </div>

      {/* Ratio bar */}
      <div
        className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-[var(--surface-3)]"
        role="img"
        aria-label={`${player1Name} ${p1KillsOnP2} : ${p2KillsOnP1} ${player2Name}`}
      >
        <div
          className="rounded-l-full transition-all duration-500"
          style={{ width: `${p1Pct}%`, backgroundColor: PLAYER_COLORS.p1 }}
        />
        <div
          className="rounded-r-full transition-all duration-500"
          style={{ width: `${100 - p1Pct}%`, backgroundColor: PLAYER_COLORS.p2 }}
        />
      </div>
      {total > 0 && (
        <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          <span>{p1Pct.toFixed(0)}%</span>
          <span>{(100 - p1Pct).toFixed(0)}%</span>
        </div>
      )}
    </Card>
  );
}
