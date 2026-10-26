import Link from "next/link";
import { ChevronLeft, ChevronRight, ListVideo } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ReplayPlaylist {
  index: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
}

/** "Playlista 3/12 · ← →": steps through the rounds picked in the team analysis. */
export function PlaylistBar({ playlist, className }: { playlist: ReplayPlaylist; className?: string }) {
  const btn = "inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-sm hover:border-[var(--border-hover)]";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ListVideo className="h-4 w-4 text-[var(--accent)]" aria-hidden />
      <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
        Playlista {playlist.index + 1}/{playlist.total}
      </span>
      {playlist.prevHref ? (
        <Link href={playlist.prevHref} className={cn(btn, "text-[var(--text-secondary)]")} aria-label="Poprzednia runda z playlisty">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      ) : null}
      {playlist.nextHref ? (
        <Link href={playlist.nextHref} className={cn(btn, "bg-[var(--accent)] font-semibold text-[var(--on-accent)]")}>
          Następna
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      ) : (
        <span className="text-xs text-[var(--text-tertiary)]">koniec playlisty</span>
      )}
    </div>
  );
}
