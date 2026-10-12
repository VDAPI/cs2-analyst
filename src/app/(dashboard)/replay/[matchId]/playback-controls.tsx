"use client";

import { useEffect, useRef } from "react";
import { useReplayStore, TICK_RATE } from "@/stores/replay-store";
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Tag,
  Bomb,
  Eye,
} from "lucide-react";
import type { FindingView } from "@/lib/findings/view";
import { Segmented } from "@/components/tools/segmented";
import { cn } from "@/lib/utils/cn";

interface RoundInfo {
  number: number;
  winner: "CT" | "T";
  winReason: string;
  ctScore: number;
  tScore: number;
}

interface PlaybackControlsProps {
  matchId: string;
  rounds: RoundInfo[];
  /** Mistakes in the current round, marked on the timeline. */
  findingMarks?: FindingView[];
  onFinding?: (f: FindingView) => void;
}

const SEVERITY_MARK: Record<FindingView["severity"], string> = {
  high: "bg-[var(--mistake)]",
  medium: "bg-[var(--warning)]",
  low: "bg-[var(--accent)]",
};

const SPEED_OPTIONS = ["0.5", "1", "2", "4"] as const;
type SpeedOption = (typeof SPEED_OPTIONS)[number];
const SEEK_SECONDS = 5;

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Touch-first replay controls: scrubber with kill/bomb/mistake marks, transport, speed, layers and a round strip. */
export function PlaybackControls({ matchId, rounds, findingMarks = [], onFinding }: PlaybackControlsProps) {
  const {
    frames,
    kills,
    bombEvents,
    currentFrameIndex,
    currentRound,
    isPlaying,
    playbackSpeed,
    showPlayerNames,
    showGrenades,
    showFov,
    activeFindingId,
    isLoading,
    loadRound,
    setFrameIndex,
    togglePlay,
    setSpeed,
    togglePlayerNames,
    toggleGrenades,
    toggleFov,
    seekSeconds,
  } = useReplayStore();

  const totalFrames = frames.length;
  const firstTick = frames[0]?.tick ?? 0;
  const lastTick = frames[totalFrames - 1]?.tick ?? 0;
  const span = Math.max(1, lastTick - firstTick);
  const currentTick = frames[currentFrameIndex]?.tick ?? firstTick;
  const progress = totalFrames > 1 ? currentFrameIndex / (totalFrames - 1) : 0;

  const marks = [
    ...kills.map((k) => ({ tick: k.tick, kind: "kill" as const })),
    ...bombEvents.filter((b) => b.type === "PLANTED").map((b) => ({ tick: b.tick, kind: "bomb" as const })),
  ].filter((m) => m.tick >= firstTick && m.tick <= lastTick);

  const goToRound = (round: number) => {
    if (round < 1 || round > rounds.length || isLoading) return;
    loadRound(matchId, round);
  };

  // Keep the current round chip visible in the scrollable strip.
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-round="${currentRound}"]`);
    if (!strip || !chip) return;
    const target = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2;
    strip.scrollTo({ left: target, behavior: "smooth" });
  }, [currentRound]);

  /** Jump the scrubber to the frame closest to a tick (tap on a timeline mark). */
  const jumpToTick = (tick: number) => {
    const idx = frames.findIndex((f) => f.tick >= tick - 2 * TICK_RATE);
    if (idx >= 0) setFrameIndex(idx);
  };

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--glass-bg)] p-3 backdrop-blur-xl sm:p-4">
      {/* Scrubber */}
      <div>
        {findingMarks.length > 0 && (
          <div className="relative mb-1 h-4">
            {findingMarks
              .filter((f) => f.tick >= firstTick && f.tick <= lastTick)
              .map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFinding?.(f)}
                  title={`${f.label}: ${f.detail}`}
                  aria-label={`Przejdź do błędu: ${f.label}, ${clock(f.roundTime)}`}
                  className="absolute top-0 flex h-4 w-4 -translate-x-1/2 items-center justify-center"
                  style={{ left: `${((f.tick - firstTick) / span) * 100}%` }}
                >
                  <span
                    className={cn(
                      "block h-2.5 w-2.5 rotate-45 rounded-[2px]",
                      SEVERITY_MARK[f.severity],
                      f.id === activeFindingId && "ring-2 ring-[var(--text-primary)]"
                    )}
                  />
                </button>
              ))}
          </div>
        )}
        <div className="relative h-3" aria-hidden={marks.length === 0}>
          {marks.map((m, i) => (
            <button
              key={`${m.kind}-${m.tick}-${i}`}
              type="button"
              onClick={() => jumpToTick(m.tick)}
              title={m.kind === "kill" ? "Zabójstwo" : "Bomba podłożona"}
              aria-label={m.kind === "kill" ? "Przejdź do zabójstwa" : "Przejdź do podłożenia bomby"}
              className="absolute top-0 flex h-3 w-3 -translate-x-1/2 items-center justify-center"
              style={{ left: `${((m.tick - firstTick) / span) * 100}%` }}
            >
              <span
                className={cn(
                  "block rounded-full",
                  m.kind === "kill" ? "h-2.5 w-[3px] bg-[var(--mistake)]" : "h-2.5 w-2.5 bg-[var(--t-gold)]"
                )}
              />
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(totalFrames - 1, 0)}
          value={currentFrameIndex}
          onChange={(e) => setFrameIndex(parseInt(e.target.value, 10))}
          className="replay-scrubber w-full"
          style={{ ["--progress" as string]: `${progress * 100}%` }}
          disabled={totalFrames === 0}
          aria-label="Pozycja w rundzie"
          aria-valuetext={`${clock((currentTick - firstTick) / TICK_RATE)} z ${clock(span / TICK_RATE)}`}
        />
        <div className="mt-1 flex justify-between font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
          <span>{clock((currentTick - firstTick) / TICK_RATE)}</span>
          <span className="hidden items-center gap-3 sm:flex">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-[3px] rounded-full bg-[var(--mistake)]" /> zabójstwo
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--t-gold)]" /> bomba
            </span>
            {findingMarks.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rotate-45 rounded-[1px] bg-[var(--mistake)]" /> błąd
              </span>
            )}
          </span>
          <span>{clock(span / TICK_RATE)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-center gap-1 sm:gap-2">
        <TransportButton label="Poprzednia runda" onClick={() => goToRound(currentRound - 1)} disabled={currentRound <= 1 || isLoading}>
          <ChevronLeft className="h-5 w-5" />
        </TransportButton>
        <TransportButton label={`Cofnij ${SEEK_SECONDS} s`} onClick={() => seekSeconds(-SEEK_SECONDS)} disabled={totalFrames === 0}>
          <RotateCcw className="h-[18px] w-[18px]" />
        </TransportButton>
        <button
          type="button"
          onClick={togglePlay}
          disabled={totalFrames === 0}
          aria-label={isPlaying ? "Pauza" : "Odtwórz"}
          className="mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] transition-all duration-150 hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_var(--accent-glow)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] disabled:opacity-40"
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
        </button>
        <TransportButton label={`Do przodu ${SEEK_SECONDS} s`} onClick={() => seekSeconds(SEEK_SECONDS)} disabled={totalFrames === 0}>
          <RotateCw className="h-[18px] w-[18px]" />
        </TransportButton>
        <TransportButton label="Następna runda" onClick={() => goToRound(currentRound + 1)} disabled={currentRound >= rounds.length || isLoading}>
          <ChevronRight className="h-5 w-5" />
        </TransportButton>
      </div>

      {/* Speed + layers */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<SpeedOption>
          label="Prędkość odtwarzania"
          size="sm"
          className="min-w-[180px] flex-1 sm:flex-none"
          value={String(playbackSpeed) as SpeedOption}
          onChange={(v) => setSpeed(Number(v))}
          options={SPEED_OPTIONS.map((s) => ({ value: s, label: <span className="font-mono">{s}×</span> }))}
        />
        <div className="flex flex-1 flex-wrap gap-2 sm:flex-none">
          <LayerToggle label="Nicki" active={showPlayerNames} onClick={togglePlayerNames}>
            <Tag className="h-4 w-4" />
          </LayerToggle>
          <LayerToggle label="Utility i bomba" active={showGrenades} onClick={toggleGrenades}>
            <Bomb className="h-4 w-4" />
          </LayerToggle>
          <LayerToggle label="Pole widzenia" active={showFov} onClick={toggleFov}>
            <Eye className="h-4 w-4" />
          </LayerToggle>
        </div>
      </div>

      {/* Round strip */}
      <div>
        <p className="label-overline mb-1.5 text-[var(--text-tertiary)]">Rundy</p>
        <div ref={stripRef} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {rounds.map((r) => {
            const active = r.number === currentRound;
            return (
              <div key={r.number} className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  data-round={r.number}
                  onClick={() => goToRound(r.number)}
                  disabled={isLoading}
                  aria-current={active ? "true" : undefined}
                  aria-label={`Runda ${r.number}, wygrali ${r.winner}, wynik ${r.ctScore}:${r.tScore}`}
                  title={`Runda ${r.number}: ${r.winner} (${r.ctScore}:${r.tScore})`}
                  className={cn(
                    "flex h-10 w-9 flex-col items-center justify-center rounded-md border-b-[3px] font-mono text-[13px] tabular-nums transition-colors duration-150",
                    r.winner === "CT" ? "border-b-[var(--ct-blue)]" : "border-b-[var(--t-gold)]",
                    active
                      ? "bg-[var(--accent)] font-bold text-[var(--on-accent)]"
                      : "bg-[var(--surface-2)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
                  )}
                >
                  {r.number}
                </button>
                {r.number === 12 && rounds.length > 12 && (
                  <span className="mx-0.5 h-6 w-px bg-[var(--border-hover)]" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(190,160,255,0.08)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function LayerToggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)] max-md:h-10 sm:flex-none",
        active
          ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--accent-hover)]"
          : "border-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      )}
    >
      {children}
      {label}
    </button>
  );
}
