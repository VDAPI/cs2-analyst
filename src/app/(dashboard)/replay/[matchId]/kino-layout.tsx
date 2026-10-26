"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Expand, Loader2, Minimize, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface KinoRound {
  number: number;
  winner: "CT" | "T";
  ctScore: number;
  tScore: number;
}

/**
 * The replay's big view: the whole window (and the screen, on request) for
 * the radar, CT on the left, T on the right, every round in a strip at the
 * top and the playback controls along the bottom. Below 1024 px the team
 * panels drop under the map.
 */
export function KinoLayout({
  mapName,
  scoreCT,
  scoreT,
  rounds,
  currentRound,
  loading,
  onRound,
  onClose,
  map,
  controls,
  left,
  right,
  extra,
}: {
  mapName: string;
  scoreCT: number;
  scoreT: number;
  rounds: KinoRound[];
  currentRound: number;
  loading: boolean;
  onRound: (round: number) => void;
  onClose: () => void;
  map: ReactNode;
  controls: ReactNode;
  left: ReactNode;
  right: ReactNode;
  /** Shown in the header, e.g. the playlist stepper. */
  extra?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // The page under the overlay must not scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Keep the current round visible in the strip.
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-round="${currentRound}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [currentRound]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  return (
    <div ref={rootRef} className="fixed inset-0 z-[60] flex flex-col bg-[var(--canvas)]" role="dialog" aria-label={`Replay 2D: ${mapName}`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
          aria-label="Zamknij duży podgląd"
        >
          <X className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Zamknij</span>
        </button>
        <span className="font-display text-lg font-semibold text-[var(--text-primary)]">{mapName}</span>
        <span className="flex items-center gap-2 font-mono text-xl font-bold tabular-nums">
          <span className="text-[var(--ct-blue)]">{scoreCT}</span>
          <span className="text-[var(--text-disabled)]">:</span>
          <span className="text-[var(--t-gold)]">{scoreT}</span>
        </span>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" aria-label="Ładowanie rundy" />}
        <div ref={stripRef} className="order-last flex w-full gap-1 overflow-x-auto pb-1 lg:order-none lg:w-auto lg:flex-1" role="tablist" aria-label="Rundy">
          {rounds.map((r) => (
            <button
              key={r.number}
              type="button"
              role="tab"
              data-round={r.number}
              aria-selected={r.number === currentRound}
              onClick={() => onRound(r.number)}
              title={`Runda ${r.number}: wygrali ${r.winner} (${r.ctScore}:${r.tScore})`}
              className={cn(
                "flex h-9 min-w-9 shrink-0 flex-col items-center justify-center rounded-md border px-1 font-mono text-xs tabular-nums transition-colors",
                r.number === currentRound
                  ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
              )}
            >
              {r.number}
              <span className={cn("mt-0.5 h-1 w-4 rounded-full", r.winner === "CT" ? "bg-[var(--ct-blue)]" : "bg-[var(--t-gold)]")} aria-hidden />
            </button>
          ))}
        </div>
        {extra}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text-primary)] hover:border-[var(--border-hover)] lg:ml-0"
        >
          {fullscreen ? <Minimize className="h-4 w-4" aria-hidden /> : <Expand className="h-4 w-4" aria-hidden />}
          <span className="hidden sm:inline">{fullscreen ? "Wyjdź z pełnego ekranu" : "Pełny ekran"}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row lg:overflow-hidden">
        <aside className="order-2 space-y-3 lg:order-1 lg:w-72 lg:shrink-0 lg:overflow-y-auto">{left}</aside>
        <main className="order-1 flex min-h-0 min-w-0 flex-1 items-start justify-center lg:order-2 lg:h-full lg:items-center">
          {/* As big as the window allows, square: full width on phones, full height on desktop. */}
          <div className="aspect-square w-full lg:h-full lg:w-auto lg:max-w-full">{map}</div>
        </main>
        <aside className="order-3 space-y-3 lg:w-72 lg:shrink-0 lg:overflow-y-auto">{right}</aside>
      </div>

      <footer className="border-t border-[var(--border)] bg-[var(--surface-1)] px-3 py-2">
        <div className="mx-auto max-w-5xl">{controls}</div>
        <p className="mt-1 hidden text-center text-xs text-[var(--text-tertiary)] md:block">
          Spacja: start/pauza · ←/→: 5 s · Shift+←/→: runda · F: duży podgląd · Esc: zamknij
        </p>
      </footer>
    </div>
  );
}
