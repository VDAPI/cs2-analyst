"use client";

import { useReplayStore } from "@/stores/replay-store";
import { Play, Pause, SkipBack, SkipForward, Eye, EyeOff } from "lucide-react";

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
}

const SPEED_OPTIONS = [0.5, 1, 2, 4];

export function PlaybackControls({ matchId, rounds }: PlaybackControlsProps) {
  const {
    frames,
    currentFrameIndex,
    currentRound,
    isPlaying,
    playbackSpeed,
    showPlayerNames,
    isLoading,
    loadRound,
    setFrameIndex,
    togglePlay,
    setSpeed,
    togglePlayerNames,
  } = useReplayStore();

  const totalFrames = frames.length;
  const progress = totalFrames > 0 ? currentFrameIndex / (totalFrames - 1) : 0;

  const handleRoundChange = (round: number) => {
    loadRound(matchId, round);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setFrameIndex(value);
  };

  const handlePrevRound = () => {
    if (currentRound > 1) handleRoundChange(currentRound - 1);
  };

  const handleNextRound = () => {
    if (currentRound < rounds.length) handleRoundChange(currentRound + 1);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      {/* Timeline scrubber */}
      <div className="mb-3">
        <input
          type="range"
          min={0}
          max={Math.max(totalFrames - 1, 0)}
          value={currentFrameIndex}
          onChange={handleScrub}
          className="replay-scrubber w-full"
          disabled={totalFrames === 0}
        />
        <div className="mt-1 flex justify-between text-[10px] font-mono text-[var(--text-tertiary)]">
          <span>Frame {currentFrameIndex + 1}/{totalFrames || 1}</span>
          <span>{(progress * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Left: round selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevRound}
            disabled={currentRound <= 1 || isLoading}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-secondary)] disabled:opacity-30"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <select
            value={currentRound}
            onChange={(e) => handleRoundChange(parseInt(e.target.value, 10))}
            disabled={isLoading}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-primary)]"
          >
            {rounds.map((r) => (
              <option key={r.number} value={r.number}>
                R{r.number} — {r.winner} ({r.ctScore}:{r.tScore})
              </option>
            ))}
          </select>

          <button
            onClick={handleNextRound}
            disabled={currentRound >= rounds.length || isLoading}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-secondary)] disabled:opacity-30"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Center: play/pause */}
        <button
          onClick={togglePlay}
          disabled={totalFrames === 0}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-white transition-all hover:bg-[var(--accent-hover)] disabled:opacity-30"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="ml-0.5 h-5 w-5" />
          )}
        </button>

        {/* Right: speed + toggles */}
        <div className="flex items-center gap-3">
          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => setSpeed(speed)}
                className={`rounded-md px-2 py-1 text-xs font-mono transition-colors ${
                  playbackSpeed === speed
                    ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                    : "text-[var(--text-tertiary)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Toggle names */}
          <button
            onClick={togglePlayerNames}
            className={`rounded-md p-1.5 transition-colors ${
              showPlayerNames
                ? "text-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
            title={showPlayerNames ? "Hide player names" : "Show player names"}
          >
            {showPlayerNames ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
