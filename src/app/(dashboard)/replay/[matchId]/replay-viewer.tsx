"use client";

import { useEffect, useRef, useCallback } from "react";
import { useReplayStore } from "@/stores/replay-store";
import type { PlayerSnapshot, KillEvent } from "@/stores/replay-store";
import { PlaybackControls } from "./playback-controls";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface MapConfigData {
  posX: number;
  posY: number;
  scale: number;
  width: number;
  height: number;
}

interface RoundInfo {
  number: number;
  winner: "CT" | "T";
  winReason: string;
  ctScore: number;
  tScore: number;
}

interface PlayerInfo {
  steamId: string;
  name: string;
  team: "CT" | "T";
}

interface ReplayViewerProps {
  matchId: string;
  mapName: string;
  mapConfig: MapConfigData | null;
  rounds: RoundInfo[];
  players: PlayerInfo[];
  scoreCT: number;
  scoreT: number;
}

const CT_COLOR = "#60a5fa";
const T_COLOR = "#fbbf24";
const CT_COLOR_DEAD = "rgba(96, 165, 250, 0.3)";
const T_COLOR_DEAD = "rgba(251, 191, 36, 0.3)";
const KILL_MARKER_COLOR = "#ef4444";
const CANVAS_SIZE = 1024;
const PLAYER_RADIUS = 10;

export function ReplayViewer({
  matchId,
  mapName,
  mapConfig,
  rounds,
  players,
  scoreCT,
  scoreT,
}: ReplayViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);

  const {
    frames,
    kills,
    currentFrameIndex,
    currentRound,
    isPlaying,
    playbackSpeed,
    showPlayerNames,
    isLoading,
    loadRound,
    nextFrame,
    togglePlay,
    reset,
  } = useReplayStore();

  // Load first round on mount
  useEffect(() => {
    loadRound(matchId, 1);
    return () => { reset(); };
  }, [matchId, loadRound, reset]);

  // Convert game coords to canvas pixel coords
  const worldToCanvas = useCallback(
    (gameX: number, gameY: number): { x: number; y: number } => {
      if (!mapConfig) {
        // Fallback: normalize to canvas assuming typical mirage bounds
        return {
          x: ((gameX + 3230) / 5120) * CANVAS_SIZE,
          y: ((1713 - gameY) / 5120) * CANVAS_SIZE,
        };
      }
      return {
        x: ((gameX - mapConfig.posX) / mapConfig.scale) * (CANVAS_SIZE / mapConfig.width),
        y: ((mapConfig.posY - gameY) / mapConfig.scale) * (CANVAS_SIZE / mapConfig.height),
      };
    },
    [mapConfig]
  );

  // Draw frame
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;

      // Clear
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, width, height);

      // Draw grid for orientation
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      const gridStep = width / 16;
      for (let i = 1; i < 16; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridStep, 0);
        ctx.lineTo(i * gridStep, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * gridStep);
        ctx.lineTo(width, i * gridStep);
        ctx.stroke();
      }

      // Map label
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.font = `bold ${width * 0.05}px "Geist Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(mapName.toUpperCase(), width / 2, height / 2);

      if (frames.length === 0) return;

      const frame = frames[currentFrameIndex];
      if (!frame) return;

      // Draw kill markers (all kills up to current tick)
      const currentTick = frame.tick;
      for (const kill of kills) {
        if (kill.tick <= currentTick) {
          const pos = worldToCanvas(kill.victimX, kill.victimY);
          drawKillMarker(ctx, pos.x, pos.y);
        }
      }

      // Draw players
      for (const player of frame.players) {
        const pos = worldToCanvas(player.x, player.y);
        drawPlayer(ctx, pos.x, pos.y, player, showPlayerNames);
      }
    },
    [frames, currentFrameIndex, kills, worldToCanvas, showPlayerNames, mapName]
  );

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const tickInterval = 32; // ticks between frames
    const tickRate = 64; // CS2 tick rate
    const msPerFrame = (tickInterval / tickRate / playbackSpeed) * 1000;

    const animate = (time: number) => {
      if (time - lastTickTimeRef.current >= msPerFrame) {
        lastTickTimeRef.current = time;
        nextFrame();
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    lastTickTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, playbackSpeed, nextFrame]);

  // Render on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    draw(ctx);
  }, [draw]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/replay"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-lg font-bold text-[var(--text-primary)]">
            {mapName}
          </h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-bold text-[#60a5fa]">{scoreCT}</span>
            <span className="text-[var(--text-disabled)]">:</span>
            <span className="font-mono font-bold text-[#fbbf24]">{scoreT}</span>
          </div>
        </div>

        {isLoading && (
          <span className="text-xs text-[var(--text-tertiary)]">Loading round data...</span>
        )}
      </div>

      {/* Canvas + sidebar */}
      <div className="flex flex-1 gap-4" ref={containerRef}>
        {/* Canvas */}
        <div className="relative aspect-square w-full max-w-[700px] flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[#1a1a2e]">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="h-full w-full"
          />
        </div>

        {/* Player list sidebar */}
        <div className="flex min-w-[200px] flex-col gap-2">
          <p className="text-xs font-medium uppercase text-[var(--text-tertiary)]">
            Players
          </p>
          {frames.length > 0 && frames[currentFrameIndex] ? (
            <>
              {frames[currentFrameIndex].players
                .filter((p) => p.team === "CT")
                .map((p) => (
                  <PlayerListItem key={p.steamId} player={p} />
                ))}
              <div className="my-1 border-t border-[var(--border)]" />
              {frames[currentFrameIndex].players
                .filter((p) => p.team === "T")
                .map((p) => (
                  <PlayerListItem key={p.steamId} player={p} />
                ))}
            </>
          ) : (
            players.map((p) => (
              <div
                key={p.steamId}
                className="flex items-center gap-2 text-xs"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: p.team === "CT" ? CT_COLOR : T_COLOR }}
                />
                <span className="text-[var(--text-secondary)]">{p.name}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Controls */}
      <PlaybackControls
        matchId={matchId}
        rounds={rounds}
      />
    </div>
  );
}

function PlayerListItem({ player }: { player: PlayerSnapshot }) {
  const color = player.team === "CT" ? CT_COLOR : T_COLOR;
  const isDead = !player.isAlive;

  return (
    <div className={`flex items-center gap-2 text-xs ${isDead ? "opacity-40" : ""}`}>
      <div
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 font-mono text-[var(--text-secondary)]">
        {player.name}
      </span>
      <span className="font-mono text-[var(--text-tertiary)]">
        {isDead ? "DEAD" : `${player.health}hp`}
      </span>
    </div>
  );
}

// ─── Drawing helpers ────────────────────────────────────

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  player: PlayerSnapshot,
  showName: boolean
) {
  const isCT = player.team === "CT";
  const isDead = !player.isAlive;

  if (isDead) {
    // Draw X for dead players
    ctx.strokeStyle = isDead && isCT ? CT_COLOR_DEAD : T_COLOR_DEAD;
    ctx.lineWidth = 2;
    const s = PLAYER_RADIUS * 0.6;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
    return;
  }

  const color = isCT ? CT_COLOR : T_COLOR;

  // Player circle
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Direction indicator (view angle)
  const angleRad = (player.yaw * Math.PI) / 180;
  const dirLen = PLAYER_RADIUS * 1.8;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x + Math.cos(angleRad) * dirLen,
    y - Math.sin(angleRad) * dirLen
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Health bar (below player)
  if (player.health < 100) {
    const barWidth = PLAYER_RADIUS * 2;
    const barHeight = 3;
    const barY = y + PLAYER_RADIUS + 4;
    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);
    // Health
    ctx.fillStyle = player.health > 50 ? "#22c55e" : player.health > 25 ? "#eab308" : "#ef4444";
    ctx.fillRect(x - barWidth / 2, barY, barWidth * (player.health / 100), barHeight);
  }

  // Player name
  if (showName) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText(player.name, x, y - PLAYER_RADIUS - 4);
  }
}

function drawKillMarker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const s = 6;
  ctx.strokeStyle = KILL_MARKER_COLOR;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
