"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListVideo, Play } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { playlistHref, type PlaylistEntry } from "@/lib/replay/playlist";

/** One round, already written out on the server (team breakdown text). */
export interface BrowserRound {
  key: string;
  matchId: string;
  /** "16:12 vs MOUZ · 12 paź". */
  matchLabel: string;
  round: number;
  side: "CT" | "T";
  buyKind: "pistol" | "eco" | "force" | "full";
  buyLabel: string;
  won: boolean;
  /** "Split A", "Obrona". */
  name: string;
  groups: string[];
  outcome: string;
  thrown: string;
  tick: number;
}

const select = "rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text-primary)]";

/**
 * Every round of a team's demos with filters (side, buy, result, play,
 * demo) and "play as a playlist": the filtered rounds one after another in
 * the 2D replay. Skybox-style round browser.
 */
export function RoundBrowser({ rounds, shared }: { rounds: BrowserRound[]; shared?: boolean }) {
  const [side, setSide] = useState("");
  const [buy, setBuy] = useState("");
  const [result, setResult] = useState("");
  const [play, setPlay] = useState("");
  const [demo, setDemo] = useState("");
  const [limit, setLimit] = useState(20);

  const plays = useMemo(() => [...new Set(rounds.map((r) => r.name))].sort(), [rounds]);
  const demos = useMemo(() => [...new Map(rounds.map((r) => [r.matchId, r.matchLabel])).entries()], [rounds]);
  const shown = rounds.filter(
    (r) =>
      (!side || r.side === side) &&
      (!buy || r.buyKind === buy) &&
      (!result || (result === "won") === r.won) &&
      (!play || r.name === play) &&
      (!demo || r.matchId === demo)
  );
  const playlist: PlaylistEntry[] = shown.slice(0, 100).map((r) => ({ matchId: r.matchId, round: r.round, tick: r.tick }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Strona" className={select} value={side} onChange={(e) => setSide(e.target.value)}>
          <option value="">Obie strony</option>
          <option value="T">T</option>
          <option value="CT">CT</option>
        </select>
        <select aria-label="Zakup" className={select} value={buy} onChange={(e) => setBuy(e.target.value)}>
          <option value="">Każdy zakup</option>
          <option value="pistol">Pistolet</option>
          <option value="eco">Eco</option>
          <option value="force">Force</option>
          <option value="full">Pełny zakup</option>
        </select>
        <select aria-label="Wynik" className={select} value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="">Wygrane i przegrane</option>
          <option value="won">Wygrane</option>
          <option value="lost">Przegrane</option>
        </select>
        <select aria-label="Zagrywka" className={select} value={play} onChange={(e) => setPlay(e.target.value)}>
          <option value="">Każda zagrywka</option>
          {plays.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {demos.length > 1 && (
          <select aria-label="Demo" className={select} value={demo} onChange={(e) => setDemo(e.target.value)}>
            <option value="">Wszystkie dema</option>
            {demos.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        )}
        <span className="font-mono text-xs text-[var(--text-tertiary)]">
          {shown.length}/{rounds.length} rund
        </span>
        {!shared && playlist.length > 0 && (
          <Link
            href={playlistHref(playlist, 0, true)}
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--on-accent)]"
          >
            <ListVideo className="h-4 w-4" aria-hidden />
            Odtwórz po kolei ({playlist.length})
          </Link>
        )}
      </div>

      <ul className="grid gap-2 md:grid-cols-2">
        {shown.slice(0, limit).map((r, i) => (
          <li key={r.key} className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[var(--text-primary)]">R{r.round}</span>
              <span className={cn("font-mono text-xs font-semibold", r.side === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>{r.side}</span>
              <span className="rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">{r.buyLabel}</span>
              <span className={r.won ? "text-[var(--good)]" : "text-[var(--mistake)]"}>{r.won ? "wygrana" : "przegrana"}</span>
              {!shared && (
                <Link
                  href={playlistHref(playlist, Math.min(i, playlist.length - 1), true)}
                  title="Otwórz w dużym replayu (dalej kolejne rundy z filtra)"
                  className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] px-2 font-mono text-xs text-[var(--accent-hover)] hover:border-[var(--border-hover)]"
                >
                  <Play className="h-3 w-3" aria-hidden />
                  2D
                </Link>
              )}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">{r.matchLabel}</p>
            <p className="font-display text-base font-semibold text-[var(--text-primary)]">{r.name}</p>
            <ul className="space-y-0.5 text-[var(--text-secondary)]">
              {r.groups.map((g, n) => (
                <li key={n}>{g}</li>
              ))}
            </ul>
            {r.outcome && <p className="text-[var(--text-secondary)]">{r.outcome}</p>}
            <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">{r.thrown}</p>
          </li>
        ))}
      </ul>
      {shown.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(limit + 20)}
          className="w-full rounded-lg border border-[var(--border)] py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
        >
          Pokaż więcej ({shown.length - limit})
        </button>
      )}
    </div>
  );
}
