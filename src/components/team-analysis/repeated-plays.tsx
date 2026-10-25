import Link from "next/link";
import { Play } from "lucide-react";
import { Card } from "@/components/ui";
import type { RepeatedPlay } from "@/lib/team/breakdown-text";

/** "Powtarzane zagrywki": each play the team ran twice or more, with its usual grenades and rounds to replay. */
export function RepeatedPlays({ plays }: { plays: RepeatedPlay[] }) {
  if (plays.length === 0) return <p className="text-sm text-[var(--text-tertiary)]">Żadna zagrywka T nie powtórzyła się jeszcze dwa razy.</p>;
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {plays.map((p) => (
        <li key={p.label}>
          <Card className="h-full space-y-1.5">
            <p className="flex flex-wrap items-baseline gap-2">
              <span className="font-display text-base font-semibold text-[var(--text-primary)]">{p.label}</span>
              <span className="font-mono text-xs text-[var(--text-tertiary)]">
                ×{p.rounds} · wygrane {p.wins}
              </span>
            </p>
            {p.utility.length > 0 && <p className="text-xs text-[var(--text-secondary)]">{p.utility.join(", ")}</p>}
            <span className="flex flex-wrap gap-1">
              {p.examples.map((r) => (
                <Link
                  key={`${r.matchId}:${r.round}`}
                  href={`/replay/${r.matchId}?round=${r.round}&tick=${r.tick}`}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 font-mono text-xs text-[var(--accent-hover)] hover:border-[var(--border-hover)]"
                >
                  <Play className="h-3 w-3" aria-hidden />R{r.round}
                </Link>
              ))}
            </span>
          </Card>
        </li>
      ))}
    </ul>
  );
}
