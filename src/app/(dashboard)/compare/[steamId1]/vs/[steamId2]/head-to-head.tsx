import { Card, Badge } from "@/components/ui";

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
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Head-to-Head
        </h2>
        <Badge variant="neutral">
          {sharedMatchCount} shared match{sharedMatchCount !== 1 ? "es" : ""}
        </Badge>
      </div>

      {/* Kill counts */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            {player1Name}
          </p>
          <p
            className="stat-number mt-1"
            style={{ color: "var(--ct-blue)" }}
          >
            {p1KillsOnP2}
          </p>
        </div>

        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-disabled)]">
            kills on each other
          </p>
        </div>

        <div className="flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
            {player2Name}
          </p>
          <p
            className="stat-number mt-1"
            style={{ color: "var(--t-gold)" }}
          >
            {p2KillsOnP1}
          </p>
        </div>
      </div>

      {/* Ratio bar */}
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className="rounded-l-full transition-all duration-500"
          style={{
            width: `${p1Pct}%`,
            backgroundColor: "var(--ct-blue)",
          }}
        />
        <div
          className="rounded-r-full transition-all duration-500"
          style={{
            width: `${100 - p1Pct}%`,
            backgroundColor: "var(--t-gold)",
          }}
        />
      </div>
    </Card>
  );
}
