"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bomb, Skull } from "lucide-react";
import { useReplayStore, TICK_RATE } from "@/stores/replay-store";
import type { PlayerSnapshot } from "@/stores/replay-store";
import { PlaybackControls } from "./playback-controls";
import { MapViewport } from "@/components/maps/map-viewport";
import { useCanvasUiScale, useRadarImage } from "@/components/maps/use-canvas";
import { ToolHeader } from "@/components/tools/tool-header";
import { drawRadarBackground, makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import {
  PLAYER_RADIUS,
  activeBomb,
  drawActiveFires,
  drawActiveSmokes,
  drawBombMarker,
  drawFlashOverlay,
  drawGrenadeTrajectories,
  drawHEExplosions,
  drawKillMarker,
  drawPlayer,
} from "@/lib/canvas/replay-draw";
import { cn } from "@/lib/utils/cn";

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
  mapConfig: RadarConfig | null;
  rounds: RoundInfo[];
  players: PlayerInfo[];
  scoreCT: number;
  scoreT: number;
  /** Round to open first (deep link). */
  initialRound?: number;
  /** Tick to jump to in initialRound; playback starts a moment before it. */
  initialTick?: number | null;
}

/** Seconds of lead-in shown before a deep-linked tick. */
const DEEP_LINK_LEAD_S = 2;
/** Kill markers glow for this long after the kill. */
const FRESH_KILL_TICKS = 2 * TICK_RATE;
/** Tap tolerance around a player dot, in canvas pixels. */
const TAP_RADIUS = PLAYER_RADIUS * 3;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function winReasonLabel(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("defus")) return "rozbrojenie";
  if (r.includes("explod") || r.includes("bomb")) return "wybuch bomby";
  if (r.includes("time")) return "koniec czasu";
  if (r.includes("elim") || r.includes("kill") || r.includes("win")) return "eliminacja";
  return reason.replace(/_/g, " ").toLowerCase();
}

export function ReplayViewer({
  matchId,
  mapName,
  mapConfig,
  rounds,
  players,
  scoreCT,
  scoreT,
  initialRound = 1,
  initialTick = null,
}: ReplayViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTickTimeRef = useRef<number>(0);
  const radar = useRadarImage(mapConfig?.radarImage);
  const worldToCanvas = useMemo(() => makeWorldToCanvas(mapConfig), [mapConfig]);
  const reducedMotion = usePrefersReducedMotion();
  const [zoom, setZoom] = useState(1);
  const ui = useCanvasUiScale(canvasRef, zoom);

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
    selectedSteamId,
    isLoading,
    loadRound,
    nextFrame,
    togglePlay,
    seekSeconds,
    selectPlayer,
    reset,
  } = useReplayStore();

  // Load the first (or deep-linked) round on mount
  useEffect(() => {
    const round = rounds.some((r) => r.number === initialRound) ? initialRound : 1;
    loadRound(matchId, round).then(() => {
      if (initialTick == null || round !== initialRound) return;
      const { frames: loaded, setFrameIndex } = useReplayStore.getState();
      const target = initialTick - DEEP_LINK_LEAD_S * TICK_RATE;
      const idx = loaded.findIndex((f) => f.tick >= target);
      if (idx > 0) setFrameIndex(idx);
    });
    return () => {
      reset();
    };
    // Deep-link params only apply on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, loadRound, reset]);

  const frame = frames[currentFrameIndex];
  const currentTick = frame?.tick ?? 0;

  // Draw the current frame
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { width, height } = ctx.canvas;

    drawRadarBackground(ctx, radar, 0.3, mapName);
    if (!frame) return;

    if (showGrenades) {
      drawActiveSmokes(ctx, grenadeEvents, currentTick, worldToCanvas);
      drawActiveFires(ctx, grenadeEvents, currentTick, worldToCanvas);
      drawGrenadeTrajectories(ctx, grenadeEvents, currentTick, worldToCanvas);
    }

    for (const kill of kills) {
      if (kill.tick > currentTick) continue;
      const pos = worldToCanvas(kill.victimX, kill.victimY);
      drawKillMarker(ctx, pos.x, pos.y, currentTick - kill.tick < FRESH_KILL_TICKS, ui);
    }

    if (showGrenades) {
      drawBombMarker(ctx, bombEvents, currentTick, worldToCanvas, ui);
      drawHEExplosions(ctx, grenadeEvents, currentTick, worldToCanvas);
    }

    // Selected player last so the ring and name sit on top
    const ordered = [...frame.players].sort(
      (a, b) => Number(a.steamId === selectedSteamId) - Number(b.steamId === selectedSteamId)
    );
    for (const p of ordered) {
      const pos = worldToCanvas(p.x, p.y);
      drawPlayer(ctx, pos.x, pos.y, p, showPlayerNames, p.steamId === selectedSteamId, currentTick, ui);
    }

    if (showGrenades) {
      drawFlashOverlay(ctx, grenadeEvents, currentTick, width, height, worldToCanvas, !reducedMotion);
    }
  }, [frame, currentTick, kills, grenadeEvents, bombEvents, showGrenades, showPlayerNames, selectedSteamId, worldToCanvas, radar, mapName, reducedMotion, ui]);

  // Playback loop; pauses while the tab is hidden
  useEffect(() => {
    if (!isPlaying || frames.length < 2) return;
    const ticksPerFrame = Math.max(1, frames[1].tick - frames[0].tick);
    const msPerFrame = (ticksPerFrame / TICK_RATE / playbackSpeed) * 1000;

    const animate = (time: number) => {
      if (time - lastTickTimeRef.current >= msPerFrame) {
        lastTickTimeRef.current = time;
        nextFrame();
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    lastTickTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(animate);

    const onVisibility = () => {
      if (document.hidden && useReplayStore.getState().isPlaying) togglePlay();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isPlaying, playbackSpeed, nextFrame, frames, togglePlay]);

  // Keyboard: Space play/pause, ←/→ 5 s, Shift+←/→ round
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        if (t instanceof HTMLButtonElement) return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        e.preventDefault();
        if (e.shiftKey) {
          const { currentRound: cr, isLoading: busy } = useReplayStore.getState();
          const next = cr + dir;
          if (!busy && next >= 1 && next <= rounds.length) loadRound(matchId, next);
        } else {
          seekSeconds(5 * dir);
        }
      } else if (e.key === "Escape") {
        selectPlayer(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, seekSeconds, selectPlayer, loadRound, matchId, rounds.length]);

  const onTap = ({ x, y }: { x: number; y: number }) => {
    if (!frame) return;
    let best: PlayerSnapshot | null = null;
    let bestDist = TAP_RADIUS * ui;
    for (const p of frame.players) {
      const pos = worldToCanvas(p.x, p.y);
      const d = Math.hypot(pos.x - x, pos.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) selectPlayer(best.steamId);
    else if (selectedSteamId) selectPlayer(null);
  };

  const roundInfo = rounds.find((r) => r.number === currentRound);
  const firstTick = frames[0]?.tick ?? 0;
  const elapsed = Math.max(0, (currentTick - firstTick) / TICK_RATE);
  const bomb = showGrenades ? activeBomb(bombEvents, currentTick) : null;
  const visibleKills = kills.filter((k) => k.tick <= currentTick);

  const livePlayers = frame?.players ?? [];
  const sideList = (side: "CT" | "T") =>
    livePlayers.length > 0
      ? livePlayers.filter((p) => p.team === side)
      : players.filter((p) => p.team === side).map((p) => ({ ...p, health: 100, isAlive: true, weapon: "", x: 0, y: 0, z: 0, yaw: 0 }));
  const aliveCount = (side: "CT" | "T") => livePlayers.filter((p) => p.team === side && p.isAlive).length;

  return (
    <div className="flex flex-col gap-4">
      <ToolHeader
        backHref="/replay"
        backLabel="Replay 2D"
        overline="Replay 2D"
        title={mapName}
        scoreCT={scoreCT}
        scoreT={scoreT}
        loading={isLoading}
        loadingLabel="Ładowanie rundy…"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,760px)_minmax(260px,1fr)] lg:items-start">
        <div className="min-w-0 space-y-3">
          <MapViewport
            onZoomChange={setZoom}
            canvasRef={canvasRef}
            size={TOOL_CANVAS_SIZE}
            onTap={onTap}
            label={`Replay 2D, runda ${currentRound}, mapa ${mapName}`}
          >
            <div className="pointer-events-none absolute left-2 top-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-2.5 py-1.5 backdrop-blur-md">
                <span className="font-display text-sm font-semibold text-[var(--text-primary)]">R{currentRound}</span>
                <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
                  {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")}
                </span>
              </div>
              {livePlayers.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-2.5 py-1 font-mono text-sm font-semibold tabular-nums backdrop-blur-md">
                  <span className="text-[var(--ct-blue)]">{aliveCount("CT")}</span>
                  <span className="text-[var(--text-disabled)]">vs</span>
                  <span className="text-[var(--t-gold)]">{aliveCount("T")}</span>
                </div>
              )}
              {bomb && (
                <div className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,194,61,0.4)] bg-[var(--glass-bg)] px-2.5 py-1 backdrop-blur-md">
                  <Bomb className="h-3.5 w-3.5 text-[var(--t-gold)]" />
                  <span className="font-mono text-sm tabular-nums text-[var(--t-gold)]">{bomb.remaining.toFixed(1)} s</span>
                  {bomb.event.site && <span className="text-xs text-[var(--text-tertiary)]">{bomb.event.site}</span>}
                </div>
              )}
            </div>
          </MapViewport>

          <PlaybackControls matchId={matchId} rounds={rounds} />

          <p className="hidden text-[13px] text-[var(--text-tertiary)] md:block">
            Spacja: start/pauza · ←/→: 5 s · Shift+←/→: runda · kliknij gracza, aby go wyróżnić · Ctrl+kółko: zoom
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:col-span-2 lg:col-span-1">
            {roundInfo ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Rundę {roundInfo.number} wygrali{" "}
                <span className={cn("font-semibold", roundInfo.winner === "CT" ? "text-[var(--ct-blue)]" : "text-[var(--t-gold)]")}>
                  {roundInfo.winner}
                </span>{" "}
                · {winReasonLabel(roundInfo.winReason)} ·{" "}
                <span className="font-mono tabular-nums">
                  {roundInfo.ctScore}:{roundInfo.tScore}
                </span>
              </p>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">Wybierz rundę.</p>
            )}
          </div>

          <SidePanel
            side="CT"
            players={sideList("CT")}
            selectedSteamId={selectedSteamId}
            onSelect={selectPlayer}
          />
          <SidePanel
            side="T"
            players={sideList("T")}
            selectedSteamId={selectedSteamId}
            onSelect={selectPlayer}
          />

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 sm:col-span-2 lg:col-span-1">
            <p className="label-overline mb-2 text-[var(--text-tertiary)]">Killfeed</p>
            {visibleKills.length === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)]">Jeszcze nikt nie zginął w tej rundzie.</p>
            ) : (
              <ul className="max-h-[200px] space-y-1 overflow-y-auto">
                {visibleKills.map((k, i) => (
                  <li key={`${k.tick}-${i}`} className="flex min-w-0 items-center gap-1.5 text-[13px]">
                    <span className="truncate font-mono text-[var(--text-primary)]">{k.attackerName || "świat"}</span>
                    <span className="shrink-0 text-[var(--text-tertiary)]">{k.weapon}</span>
                    {k.headshot && (
                      <span className="shrink-0 rounded-full bg-[var(--accent-2-muted)] px-1.5 text-[11px] font-semibold text-[var(--accent-2)]">HS</span>
                    )}
                    <Skull className="h-3.5 w-3.5 shrink-0 text-[var(--mistake)]" aria-label="zabił" />
                    <span className="truncate font-mono text-[var(--text-tertiary)]">{k.victimName}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidePanel({
  side,
  players,
  selectedSteamId,
  onSelect,
}: {
  side: "CT" | "T";
  players: PlayerSnapshot[];
  selectedSteamId: string | null;
  onSelect: (steamId: string) => void;
}) {
  const isCT = side === "CT";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
      <div
        className={cn(
          "mb-1.5 flex items-center gap-2 rounded-md px-2 py-1",
          isCT ? "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]" : "bg-[var(--t-gold-muted)] text-[var(--t-gold)]"
        )}
      >
        <span className={cn("h-2 w-2 rounded-full", isCT ? "bg-[var(--ct-blue)]" : "bg-[var(--t-gold)]")} />
        <span className="label-overline">{isCT ? "Counter-Terrorists" : "Terrorists"}</span>
      </div>
      <ul className="space-y-0.5">
        {players.map((p) => (
          <li key={p.steamId}>
            <PlayerRow player={p} selected={p.steamId === selectedSteamId} onSelect={onSelect} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  onSelect,
}: {
  player: PlayerSnapshot;
  selected: boolean;
  onSelect: (steamId: string) => void;
}) {
  const dead = !player.isAlive;
  const color = player.team === "CT" ? "var(--ct-blue)" : "var(--t-gold)";
  return (
    <button
      type="button"
      onClick={() => onSelect(player.steamId)}
      aria-pressed={selected}
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-150 md:min-h-9",
        selected ? "bg-[var(--accent-muted)] ring-1 ring-[var(--accent)]" : "hover:bg-[var(--surface-2)]",
        dead && !selected && "opacity-45"
      )}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate font-mono text-[var(--text-secondary)]">{player.name}</span>
      {player.weapon && !dead && (
        <span className="hidden max-w-[80px] truncate text-xs text-[var(--text-tertiary)] sm:inline">
          {player.weapon.replace(/^weapon_/, "")}
        </span>
      )}
      {dead ? (
        <span className="font-mono text-xs font-semibold text-[var(--mistake)]">✕</span>
      ) : (
        <>
          <span className="w-7 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{player.health}</span>
          <span className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-[var(--surface-4)]">
            <span
              className="block h-full rounded-full"
              style={{ width: `${player.health}%`, backgroundColor:
                  player.health > 50 ? "var(--good)" : player.health > 25 ? "var(--warning)" : "var(--mistake)",
               }}
            />
          </span>
        </>
      )}
    </button>
  );
}
