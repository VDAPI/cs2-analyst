import { cn } from "@/lib/utils/cn";

export type MatchResult = "W" | "L" | "D";

const RESULT: Record<MatchResult, { short: string; label: string; className: string }> = {
  W: { short: "W", label: "Wygrana", className: "bg-[var(--good-muted)] text-[var(--good)]" },
  L: { short: "P", label: "Przegrana", className: "bg-[var(--mistake-muted)] text-[var(--mistake)]" },
  D: { short: "R", label: "Remis", className: "bg-[rgba(190,160,255,0.08)] text-[var(--text-tertiary)]" },
};

/** Result color for borders and score digits. */
export const resultColor = (r: MatchResult | null | undefined) =>
  r === "W" ? "var(--good)" : r === "L" ? "var(--mistake)" : "var(--text-tertiary)";

/** W / P / R pill (Wygrana, Przegrana, Remis). `full` spells the word out. */
export function ResultBadge({
  result,
  full,
  className,
}: {
  result: MatchResult;
  full?: boolean;
  className?: string;
}) {
  const r = RESULT[result];
  return (
    <span
      title={r.label}
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none",
        r.className,
        className
      )}
    >
      {full ? r.label : r.short}
      {!full && <span className="sr-only"> ({r.label})</span>}
    </span>
  );
}

/** Result of `team` given the final score. */
export function resultFor(team: string, scoreCT: number, scoreT: number): MatchResult {
  const own = team === "CT" ? scoreCT : scoreT;
  const enemy = team === "CT" ? scoreT : scoreCT;
  return own > enemy ? "W" : own < enemy ? "L" : "D";
}
