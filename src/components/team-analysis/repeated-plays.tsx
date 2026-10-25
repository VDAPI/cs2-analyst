import Link from "next/link";
import { Play } from "lucide-react";
import { Card } from "@/components/ui";
import type { NameOf, RepeatedPlay } from "@/lib/team/breakdown-text";
import { boardFromRound } from "@/lib/team/board";
import { getMapConfig } from "@/lib/utils/maps";
import { PlayToBoard } from "./play-to-board";

export interface BoardContext {
  map: string;
  teams: Array<{ id: string; name: string }>;
  nameOf: NameOf;
}

/** "Powtarzane zagrywki": each play the team ran twice or more, with its usual grenades and rounds to replay. */
export function RepeatedPlays({ plays, board, shared }: { plays: RepeatedPlay[]; board?: BoardContext; shared?: boolean }) {
  const config = board ? (getMapConfig(board.map) ?? null) : null;
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
              {!shared && p.examples.map((r) => (
                <Link
                  key={`${r.matchId}:${r.round}`}
                  href={`/replay/${r.matchId}?round=${r.round}&tick=${r.tick}`}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 font-mono text-xs text-[var(--accent-hover)] hover:border-[var(--border-hover)]"
                >
                  <Play className="h-3 w-3" aria-hidden />R{r.round}
                </Link>
              ))}
            </span>
            {board && p.examples[0] && (
              <PlayToBoard
                teams={board.teams}
                map={board.map}
                name={p.label}
                side={p.examples[0].side}
                data={boardFromRound(
                  config,
                  p.examples[0].side,
                  p.examples[0].positions.map((x) => ({ name: board.nameOf(x.steamId), x: x.x, y: x.y })),
                  p.examples[0].thrown.filter((g) => p.examples[0].hitS == null || g.s <= p.examples[0].hitS + 3),
                  { setup: p.label, utility: p.utility.join(", ") }
                )}
              />
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
