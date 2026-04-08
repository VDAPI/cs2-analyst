"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useReplayStore } from "@/stores/replay-store";
import type { PlayerSnapshot, ReplayGrenadeEvent, ReplayBombEvent } from "@/stores/replay-store";
import { PlaybackControls } from "./playback-controls";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface MapConfigData {
  posX: number;
  posY: number;
  scale: number;
  width: number;
  height: number;
  radarImage: string;
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
const PLAYER_RADIUS = 12;

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
  const [radarImage, setRadarImage] = useState<HTMLImageElement | null>(null);

  const {
    frames,
    kills,
    grenadeEvents,
    bombEvents,
    currentFrameIndex,
    currentRound,
    isPlaying,
    playbackSpeed,
    showPlayerNames,
    showGrenades,
    isLoading,
    loadRound,
    nextFrame,
    togglePlay,
    reset,
  } = useReplayStore();

  // Load radar image
  useEffect(() => {
    if (!mapConfig?.radarImage) return;
    const img = new Image();
    img.src = mapConfig.radarImage;
    img.onload = () => setRadarImage(img);
  }, [mapConfig?.radarImage]);

  // Load first round on mount
  useEffect(() => {
    loadRound(matchId, 1);
    return () => { reset(); };
  }, [matchId, loadRound, reset]);

  // Convert game coords to canvas pixel coords
  const worldToCanvas = useCallback(
    (gameX: number, gameY: number): { x: number; y: number } => {
      if (!mapConfig) {
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

      // Clear with dark background
      ctx.fillStyle = "#0a0a12";
      ctx.fillRect(0, 0, width, height);

      // Draw radar image (desaturated, ~30% opacity per DESIGN.md)
      if (radarImage) {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.filter = "grayscale(100%)";
        ctx.drawImage(radarImage, 0, 0, width, height);
        ctx.restore();
      } else {
        // Fallback grid when no radar image
        ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
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
        // Map name watermark
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        ctx.font = `bold ${width * 0.06}px "Geist Mono", monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(mapName.toUpperCase(), width / 2, height / 2);
      }

      if (frames.length === 0) return;

      const frame = frames[currentFrameIndex];
      if (!frame) return;

      const currentTick = frame.tick;

      // Draw grenade effects (below players)
      if (showGrenades) {
        drawActiveSmokes(ctx, grenadeEvents, currentTick, worldToCanvas);
        drawActiveFires(ctx, grenadeEvents, currentTick, worldToCanvas);
        drawGrenadeTrajectories(ctx, grenadeEvents, currentTick, worldToCanvas);
      }

      // Draw kill markers (all kills up to current tick)
      for (const kill of kills) {
        if (kill.tick <= currentTick) {
          const pos = worldToCanvas(kill.victimX, kill.victimY);
          drawKillMarker(ctx, pos.x, pos.y);
        }
      }

      // Draw bomb marker
      if (showGrenades) {
        drawBombMarker(ctx, bombEvents, currentTick, worldToCanvas, width);
      }

      // Draw HE explosions (above kill markers, below players)
      if (showGrenades) {
        drawHEExplosions(ctx, grenadeEvents, currentTick, worldToCanvas);
      }

      // Draw players
      for (const player of frame.players) {
        const pos = worldToCanvas(player.x, player.y);
        drawPlayer(ctx, pos.x, pos.y, player, showPlayerNames);
      }

      // Draw flash overlay (on top of everything)
      if (showGrenades) {
        drawFlashOverlay(ctx, grenadeEvents, currentTick, width, height, worldToCanvas);
      }
    },
    [frames, currentFrameIndex, kills, grenadeEvents, bombEvents, showGrenades, worldToCanvas, showPlayerNames, mapName, radarImage]
  );

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const tickInterval = 32;
    const tickRate = 64;
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
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

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
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {mapName}
          </h1>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-[var(--ct-blue)]">{scoreCT}</span>
            <span className="text-[var(--text-disabled)]">:</span>
            <span className="font-mono text-lg font-bold text-[var(--t-gold)]">{scoreT}</span>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <span className="text-xs text-[var(--text-tertiary)]">Loading round...</span>
          </div>
        )}
      </div>

      {/* Canvas + sidebar */}
      <div className="flex flex-1 gap-4" ref={containerRef}>
        {/* Canvas */}
        <div className="relative aspect-square w-full max-w-[700px] flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border)] shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="h-full w-full"
          />
          {/* Round info overlay */}
          <div className="absolute left-3 top-3 rounded-lg bg-[rgba(15,15,18,0.8)] px-3 py-1.5 backdrop-blur-sm">
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              R{currentRound}
            </span>
            {frames.length > 0 && (
              <span className="ml-2 font-mono text-[10px] text-[var(--text-tertiary)]">
                {currentFrameIndex + 1}/{frames.length}
              </span>
            )}
          </div>
        </div>

        {/* Player list sidebar */}
        <div className="flex min-w-[220px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
          {/* CT players */}
          <div className="mb-1 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--ct-blue)]" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--ct-blue)]">
              Counter-Terrorists
            </span>
          </div>
          <div className="space-y-1">
            {frames.length > 0 && frames[currentFrameIndex] ? (
              frames[currentFrameIndex].players
                .filter((p) => p.team === "CT")
                .map((p) => <PlayerListItem key={p.steamId} player={p} />)
            ) : (
              players
                .filter((p) => p.team === "CT")
                .map((p) => (
                  <div key={p.steamId} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <div className="h-2 w-2 rounded-full bg-[var(--ct-blue)]" />
                    <span className="font-mono text-[var(--text-secondary)]">{p.name}</span>
                  </div>
                ))
            )}
          </div>

          <div className="my-3 border-t border-[var(--border)]" />

          {/* T players */}
          <div className="mb-1 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-[var(--t-gold)]" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--t-gold)]">
              Terrorists
            </span>
          </div>
          <div className="space-y-1">
            {frames.length > 0 && frames[currentFrameIndex] ? (
              frames[currentFrameIndex].players
                .filter((p) => p.team === "T")
                .map((p) => <PlayerListItem key={p.steamId} player={p} />)
            ) : (
              players
                .filter((p) => p.team === "T")
                .map((p) => (
                  <div key={p.steamId} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
                    <div className="h-2 w-2 rounded-full bg-[var(--t-gold)]" />
                    <span className="font-mono text-[var(--text-secondary)]">{p.name}</span>
                  </div>
                ))
            )}
          </div>

          {/* Kill feed */}
          {kills.length > 0 && frames[currentFrameIndex] && (
            <>
              <div className="my-3 border-t border-[var(--border)]" />
              <div className="mb-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                  Kill Feed
                </span>
              </div>
              <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 160 }}>
                {kills
                  .filter((k) => k.tick <= frames[currentFrameIndex].tick)
                  .map((k, i) => (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <span className="font-mono text-[var(--text-primary)]">{k.attackerName}</span>
                      <span className="text-[var(--text-disabled)]">
                        {k.headshot ? "●" : "→"}
                      </span>
                      <span className="font-mono text-[var(--text-tertiary)]">{k.victimName}</span>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Controls */}
      <PlaybackControls matchId={matchId} rounds={rounds} />
    </div>
  );
}

function PlayerListItem({ player }: { player: PlayerSnapshot }) {
  const isCT = player.team === "CT";
  const isDead = !player.isAlive;
  const color = isCT ? "var(--ct-blue)" : "var(--t-gold)";

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-opacity ${
        isDead ? "opacity-35" : ""
      }`}
    >
      <div
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="flex-1 truncate font-mono text-[var(--text-secondary)]">
        {player.name}
      </span>
      {isDead ? (
        <span className="font-mono text-[10px] text-[var(--error)]">DEAD</span>
      ) : (
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
          {player.health}
        </span>
      )}
      {!isDead && (
        <div className="h-1 w-8 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${player.health}%`,
              backgroundColor:
                player.health > 50 ? "#22c55e" : player.health > 25 ? "#eab308" : "#ef4444",
            }}
          />
        </div>
      )}
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
    // Death X marker (per DESIGN.md: × in #ef4444, 16px)
    ctx.strokeStyle = isCT ? CT_COLOR_DEAD : T_COLOR_DEAD;
    ctx.lineWidth = 2;
    const s = 8;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
    return;
  }

  const color = isCT ? CT_COLOR : T_COLOR;

  // Player circle (12px per DESIGN.md, white outline)
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Direction indicator (view angle)
  const angleRad = (player.yaw * Math.PI) / 180;
  const dirLen = PLAYER_RADIUS * 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x + Math.cos(angleRad) * dirLen,
    y - Math.sin(angleRad) * dirLen
  );
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Health bar (below player)
  if (player.health < 100) {
    const barWidth = PLAYER_RADIUS * 2.2;
    const barHeight = 3;
    const barY = y + PLAYER_RADIUS + 5;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);
    ctx.fillStyle = player.health > 50 ? "#22c55e" : player.health > 25 ? "#eab308" : "#ef4444";
    ctx.fillRect(x - barWidth / 2, barY, barWidth * (player.health / 100), barHeight);
  }

  // Player name (Geist Mono 10px, white with black outline per DESIGN.md)
  if (showName) {
    const nameY = y - PLAYER_RADIUS - 6;
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    // Black outline
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 3;
    ctx.strokeText(player.name, x, nameY);
    // White fill
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(player.name, x, nameY);
  }
}

function drawKillMarker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const s = 8;
  ctx.strokeStyle = KILL_MARKER_COLOR;
  ctx.lineWidth = 2.5;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ─── Grenade drawing helpers ──────────────────────────────

const GRENADE_COLORS: Record<string, string> = {
  SMOKE: "#94a3b8",
  FLASH: "#fde047",
  HE: "#ef4444",
  MOLOTOV: "#f97316",
  INCENDIARY: "#f97316",
};

const TICK_RATE = 64;

// Smoke covers ~144 game units. On de_mirage (scale=5), that's 144/5 ≈ 29 radar pixels.
// Canvas is 1024px for a 1024px radar → multiply by (CANVAS_SIZE / radarWidth) = 1.
// Use ~30 canvas pixels as base, but scale slightly larger for visual clarity.
const SMOKE_RADIUS = 34;
const MOLOTOV_RADIUS = 26;
const HE_MAX_RADIUS = 30;

function grenadeDurationTicks(g: ReplayGrenadeEvent): number {
  if (g.type === "SMOKE") return ((g.duration ?? 18000) / 1000) * TICK_RATE;
  if (g.type === "MOLOTOV" || g.type === "INCENDIARY") return ((g.duration ?? 7000) / 1000) * TICK_RATE;
  return 0;
}

function drawActiveSmokes(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: (x: number, y: number) => { x: number; y: number }
) {
  for (const g of grenades) {
    if (g.type !== "SMOKE") continue;
    const dur = grenadeDurationTicks(g);
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= dur) continue;

    const pos = worldToCanvas(g.landX, g.landY);

    // Fade envelope
    const fadeIn = 64;
    const fadeOut = 128;
    let fade = 1;
    if (elapsed < fadeIn) fade = elapsed / fadeIn;
    else if (elapsed > dur - fadeOut) fade = (dur - elapsed) / fadeOut;

    // Subtle pulse animation
    const pulse = 1 + Math.sin(currentTick * 0.04) * 0.04;
    const radius = SMOKE_RADIUS * pulse;

    ctx.save();

    // Outer smoke body — solid fill with soft edge
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
    grad.addColorStop(0, `rgba(200, 210, 220, ${0.6 * fade})`);
    grad.addColorStop(0.5, `rgba(148, 163, 184, ${0.55 * fade})`);
    grad.addColorStop(0.8, `rgba(148, 163, 184, ${0.3 * fade})`);
    grad.addColorStop(1, `rgba(148, 163, 184, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // White center glow
    const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 0.4);
    glow.addColorStop(0, `rgba(255, 255, 255, ${0.25 * fade})`);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Crisp border ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(148, 163, 184, ${0.35 * fade})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
}

function drawActiveFires(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: (x: number, y: number) => { x: number; y: number }
) {
  for (const g of grenades) {
    if (g.type !== "MOLOTOV" && g.type !== "INCENDIARY") continue;
    const dur = grenadeDurationTicks(g);
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= dur) continue;

    const pos = worldToCanvas(g.landX, g.landY);

    // Fade envelope
    const fadeIn = 32;
    const fadeOut = 64;
    let fade = 1;
    if (elapsed < fadeIn) fade = elapsed / fadeIn;
    else if (elapsed > dur - fadeOut) fade = (dur - elapsed) / fadeOut;

    // Flicker animation — oscillate radius and alpha
    const flicker1 = Math.sin(currentTick * 0.5) * 0.08;
    const flicker2 = Math.sin(currentTick * 0.23 + 1.7) * 0.06;
    const alpha = (0.5 + flicker1 + flicker2) * fade;
    const radius = MOLOTOV_RADIUS * (1 + Math.sin(currentTick * 0.35) * 0.06);

    ctx.save();

    // Fire body — bright orange core with red outer
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
    grad.addColorStop(0, `rgba(255, 160, 30, ${alpha * 1.1})`);
    grad.addColorStop(0.4, `rgba(249, 115, 22, ${alpha})`);
    grad.addColorStop(0.75, `rgba(220, 70, 10, ${alpha * 0.6})`);
    grad.addColorStop(1, `rgba(180, 40, 0, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Bright center hotspot
    const hot = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 0.3);
    hot.addColorStop(0, `rgba(255, 230, 100, ${0.35 * fade})`);
    hot.addColorStop(1, "rgba(255, 200, 50, 0)");
    ctx.fillStyle = hot;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawHEExplosions(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: (x: number, y: number) => { x: number; y: number }
) {
  const heDuration = 32; // ~500ms
  for (const g of grenades) {
    if (g.type !== "HE") continue;
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= heDuration) continue;

    const pos = worldToCanvas(g.landX, g.landY);
    const progress = elapsed / heDuration;
    const radius = 6 + progress * (HE_MAX_RADIUS - 6);
    const alpha = (1 - progress);

    ctx.save();

    // Outer red blast ring
    const grad = ctx.createRadialGradient(pos.x, pos.y, radius * 0.3, pos.x, pos.y, radius);
    grad.addColorStop(0, `rgba(255, 100, 50, ${0.6 * alpha})`);
    grad.addColorStop(0.6, `rgba(239, 68, 68, ${0.5 * alpha})`);
    grad.addColorStop(1, `rgba(200, 30, 30, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Bright white-yellow core (first half of explosion)
    if (progress < 0.5) {
      const coreAlpha = (1 - progress * 2);
      const core = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 0.4);
      core.addColorStop(0, `rgba(255, 255, 200, ${0.7 * coreAlpha})`);
      core.addColorStop(1, "rgba(255, 180, 50, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Expanding ring outline
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 * alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

function drawFlashOverlay(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  width: number,
  height: number,
  worldToCanvas: (x: number, y: number) => { x: number; y: number }
) {
  const flashDuration = 19; // ~300ms at 64 tick
  for (const g of grenades) {
    if (g.type !== "FLASH") continue;
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= flashDuration) continue;

    const progress = elapsed / flashDuration;
    // Sharp peak then quick decay
    const alpha = progress < 0.15 ? (progress / 0.15) * 0.7 : 0.7 * (1 - (progress - 0.15) / 0.85);

    ctx.save();

    // Full-screen white flash
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
    ctx.fillRect(0, 0, width, height);

    // Bright burst circle at detonation point
    const pos = worldToCanvas(g.landX, g.landY);
    const burstRadius = 25 + progress * 15;
    const burstGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, burstRadius);
    burstGrad.addColorStop(0, `rgba(255, 255, 255, ${0.7 * (1 - progress)})`);
    burstGrad.addColorStop(0.5, `rgba(253, 224, 71, ${0.3 * (1 - progress)})`);
    burstGrad.addColorStop(1, "rgba(253, 224, 71, 0)");
    ctx.fillStyle = burstGrad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, burstRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function drawGrenadeTrajectories(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: (x: number, y: number) => { x: number; y: number }
) {
  const flightTicks = 64;
  for (const g of grenades) {
    const timeToDetonate = g.tick - currentTick;
    if (timeToDetonate <= 0 || timeToDetonate > flightTicks) continue;

    const throwPos = worldToCanvas(g.throwX, g.throwY);
    const landPos = worldToCanvas(g.landX, g.landY);
    const color = GRENADE_COLORS[g.type] ?? "#ffffff";
    const alpha = 1 - timeToDetonate / flightTicks;

    ctx.save();

    // Thick dashed trajectory line
    ctx.globalAlpha = Math.max(0.3, alpha * 0.85);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(throwPos.x, throwPos.y);
    ctx.lineTo(landPos.x, landPos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Interpolated grenade position
    const t = 1 - timeToDetonate / flightTicks;
    const gx = throwPos.x + (landPos.x - throwPos.x) * t;
    const gy = throwPos.y + (landPos.y - throwPos.y) * t;

    // Grenade icon — filled circle with outline and inner dot
    ctx.globalAlpha = Math.max(0.5, alpha);
    ctx.beginPath();
    ctx.arc(gx, gy, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // White center dot
    ctx.beginPath();
    ctx.arc(gx, gy, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();

    ctx.restore();
  }
}

function drawBombMarker(
  ctx: CanvasRenderingContext2D,
  bombEvents: ReplayBombEvent[],
  currentTick: number,
  worldToCanvas: (x: number, y: number) => { x: number; y: number },
  canvasWidth: number
) {
  // Find the last PLANTED event before current tick
  let plantedEvent: ReplayBombEvent | null = null;
  let endEvent: ReplayBombEvent | null = null;

  for (const b of bombEvents) {
    if (b.type === "PLANTED" && b.tick <= currentTick) {
      plantedEvent = b;
      endEvent = null; // Reset end on new plant
    } else if (plantedEvent && (b.type === "DEFUSED" || b.type === "EXPLODED")) {
      endEvent = b;
    }
  }

  if (!plantedEvent) return;
  if (endEvent && endEvent.tick <= currentTick) return; // Already resolved

  const pos = worldToCanvas(plantedEvent.x, plantedEvent.y);

  // Pulsing outer ring
  const pulseRadius = 18 + Math.sin(currentTick * 0.08) * 6;
  ctx.save();
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, pulseRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(251, 191, 36, 0.4)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inner filled circle
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(251, 191, 36, 0.7)";
  ctx.fill();

  // Site label
  if (plantedEvent.site) {
    ctx.font = '10px "Geist Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 3;
    ctx.strokeText(plantedEvent.site, pos.x, pos.y);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(plantedEvent.site, pos.x, pos.y);
  }

  // Timer bar at bottom of canvas
  const bombTimerTicks = 40 * TICK_RATE; // 40 seconds
  const elapsed = currentTick - plantedEvent.tick;
  const remaining = Math.max(0, 1 - elapsed / bombTimerTicks);

  const barHeight = 3;
  const barY = ctx.canvas.height - barHeight;
  const barWidth = canvasWidth * remaining;

  // Background
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, barY, canvasWidth, barHeight);

  // Timer fill — gold to red
  const r = Math.round(251 + (239 - 251) * (1 - remaining));
  const gr = Math.round(191 * remaining);
  const b = Math.round(36 * remaining);
  ctx.fillStyle = `rgba(${r}, ${gr}, ${b}, 0.8)`;
  ctx.fillRect(0, barY, barWidth, barHeight);

  ctx.restore();
}
