"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { fetchRoundData, type RoundData } from "@/lib/replay/fetch-round";
import { makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import { CANVAS_COLORS } from "@/lib/canvas/palette";
import {
  VIEW_CONE_UNITS,
  drawActiveFires,
  drawActiveSmokes,
  drawFindingMarker,
  drawFlashOverlay,
  drawHEExplosions,
  drawKillMarker,
  drawPlayer,
  drawPlayerLoadout,
  drawSightLine,
  drawUtilityTimers,
  drawViewCone,
} from "@/lib/canvas/replay-draw";
import { useRadarImage } from "@/components/maps/use-canvas";
import type { PlayerSnapshot, TickFrame } from "@/stores/replay-store";
import { TICK_RATE } from "@/stores/replay-store";
import { cn } from "@/lib/utils/cn";

/** Internal resolution of the clip canvas; drawing happens in the 1024 tool space. */
const CLIP_SIZE = 640;
/** Stored replay frames are 4 ticks apart; the clip uses all of them. */
const CLIP_INTERVAL = 4;
/** Hold on the last frame before looping. */
const LOOP_PAUSE_MS = 900;
/** Player dot radius on screen, in CSS px. */
const TARGET_DOT_CSS = 8;

export interface FindingClipProps {
  matchId: string;
  mapName: string;
  mapConfig: RadarConfig | null;
  roundNumber: number;
  tick: number;
  steamId: string;
  targetSteamId: string | null;
  severity: "high" | "medium" | "low";
  /** Seconds before and after the mistake. */
  clip: { before: number; after: number };
  /** Load (and play, unless reduced motion) as soon as the clip scrolls into view. */
  autoLoad?: boolean;
  /** Accessible description of the moment. */
  label: string;
  className?: string;
}

type Status = "idle" | "loading" | "ready" | "error";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpYaw(a: number, b: number, t: number) {
  let d = ((b - a + 540) % 360) - 180;
  if (d === -180) d = 180;
  return a + d * t;
}

/** Players at `tick`, interpolated between the two surrounding frames. */
function playersAt(frames: TickFrame[], tick: number): PlayerSnapshot[] {
  if (frames.length === 0) return [];
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].tick <= tick) i++;
  const a = frames[i];
  const b = frames[i + 1];
  if (!b || tick <= a.tick) return a.players;
  const t = (tick - a.tick) / Math.max(1, b.tick - a.tick);
  const next = new Map(b.players.map((p) => [p.steamId, p]));
  return a.players.map((p) => {
    const q = next.get(p.steamId);
    if (!q || !p.isAlive || !q.isAlive) return p;
    return { ...p, x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), yaw: lerpYaw(p.yaw, q.yaw, t) };
  });
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);
  return reduced;
}

/**
 * A few seconds of 2D replay around one mistake: zoomed on the player, their
 * view cone, the enemy it was about, utility with timers, and a marker that
 * lights up at the moment. Loads its window of frames on demand.
 */
export function FindingClip({
  matchId,
  mapName,
  mapConfig,
  roundNumber,
  tick,
  steamId,
  targetSteamId,
  severity,
  clip,
  autoLoad = false,
  label,
  className,
}: FindingClipProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<RoundData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cssWidth, setCssWidth] = useState(320);
  const [visible, setVisible] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const radar = useRadarImage(mapConfig?.radarImage);
  const worldToCanvas = useMemo(() => makeWorldToCanvas(mapConfig), [mapConfig]);

  const startTick = tick - Math.round(clip.before * TICK_RATE);
  const endTick = tick + Math.round(clip.after * TICK_RATE);
  const playhead = useRef(startTick);
  const [shownTick, setShownTick] = useState(startTick);

  const load = useCallback(() => {
    if (status === "loading" || status === "ready") return;
    setStatus("loading");
    fetchRoundData(matchId, roundNumber, { interval: CLIP_INTERVAL, from: startTick - CLIP_INTERVAL, to: endTick + CLIP_INTERVAL })
      .then((d) => {
        if (d.frames.length === 0) throw new Error("no frames");
        setData(d);
        setStatus("ready");
        if (!reducedMotion) setPlaying(true);
      })
      .catch(() => setStatus("error"));
  }, [status, matchId, roundNumber, startTick, endTick, reducedMotion]);

  // Visibility: auto-load when scrolled into view, pause while off screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (autoLoad && visible && status === "idle") load();
  }, [autoLoad, visible, status, load]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCssWidth(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Camera: centred on the player at the mistake (and the enemy, if close enough to fit).
  const camera = useMemo(() => {
    if (!data) return null;
    const at = playersAt(data.frames, tick);
    const me = at.find((p) => p.steamId === steamId);
    const foe = targetSteamId ? at.find((p) => p.steamId === targetSteamId) : undefined;
    if (!me) return { cx: TOOL_CANVAS_SIZE / 2, cy: TOOL_CANVAS_SIZE / 2, zoom: 1 };
    const a = worldToCanvas(me.x, me.y);
    let cx = a.x;
    let cy = a.y;
    let zoom = 2.6;
    if (foe) {
      const b = worldToCanvas(foe.x, foe.y);
      const span = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      const fit = (TOOL_CANVAS_SIZE * 0.72) / Math.max(1, span);
      if (fit >= 1.2) {
        cx = (a.x + b.x) / 2;
        cy = (a.y + b.y) / 2;
        zoom = Math.min(zoom, fit);
      }
    }
    // Keep the view inside the map.
    const half = TOOL_CANVAS_SIZE / zoom / 2;
    cx = Math.min(TOOL_CANVAS_SIZE - half, Math.max(half, cx));
    cy = Math.min(TOOL_CANVAS_SIZE - half, Math.max(half, cy));
    return { cx, cy, zoom };
  }, [data, tick, steamId, targetSteamId, worldToCanvas]);

  const draw = useCallback(
    (at: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = CANVAS_COLORS.canvas;
      ctx.fillRect(0, 0, CLIP_SIZE, CLIP_SIZE);
      if (!data || !camera) return;

      const k = (CLIP_SIZE / TOOL_CANVAS_SIZE) * camera.zoom;
      ctx.setTransform(k, 0, 0, k, CLIP_SIZE / 2 - camera.cx * k, CLIP_SIZE / 2 - camera.cy * k);
      // On-screen size of one tool-space unit, to keep markers a steady size.
      const cssPerUnit = k * (cssWidth / CLIP_SIZE);
      const ui = Math.min(3, Math.max(0.35, TARGET_DOT_CSS / (12 * cssPerUnit)));

      if (radar) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.filter = "grayscale(100%)";
        ctx.drawImage(radar, 0, 0, TOOL_CANVAS_SIZE, TOOL_CANVAS_SIZE);
        ctx.restore();
      }

      drawActiveSmokes(ctx, data.grenadeEvents, at, worldToCanvas);
      drawActiveFires(ctx, data.grenadeEvents, at, worldToCanvas);
      drawUtilityTimers(ctx, data.grenadeEvents, at, worldToCanvas, ui);
      drawHEExplosions(ctx, data.grenadeEvents, at, worldToCanvas);

      for (const kill of data.kills) {
        if (kill.tick > at || kill.tick < startTick - 3 * TICK_RATE) continue;
        const pos = worldToCanvas(kill.victimX, kill.victimY);
        drawKillMarker(ctx, pos.x, pos.y, at - kill.tick < 2 * TICK_RATE, ui);
      }

      const players = playersAt(data.frames, at);
      const me = players.find((p) => p.steamId === steamId);
      const foe = targetSteamId ? players.find((p) => p.steamId === targetSteamId) : undefined;
      const origin = worldToCanvas(0, 0);
      const coneEnd = worldToCanvas(VIEW_CONE_UNITS, 0);
      const conePx = Math.hypot(coneEnd.x - origin.x, coneEnd.y - origin.y);

      if (foe?.isAlive) {
        const p = worldToCanvas(foe.x, foe.y);
        drawViewCone(ctx, p.x, p.y, foe.yaw, foe.team, conePx, false);
      }
      if (me?.isAlive) {
        const p = worldToCanvas(me.x, me.y);
        drawViewCone(ctx, p.x, p.y, me.yaw, me.team, conePx, true);
        if (foe?.isAlive) drawSightLine(ctx, p, worldToCanvas(foe.x, foe.y), ui);
      }

      const ordered = [...players].sort((a, b) => Number(a.steamId === steamId) - Number(b.steamId === steamId));
      for (const p of ordered) {
        const pos = worldToCanvas(p.x, p.y);
        const isMe = p.steamId === steamId;
        drawPlayer(ctx, pos.x, pos.y, p, isMe || p.steamId === targetSteamId, isMe, at, ui);
      }
      if (me) {
        const pos = worldToCanvas(me.x, me.y);
        drawPlayerLoadout(ctx, pos.x, pos.y, me, ui);
        // Full strength within ±0.4 s of the mistake, fading out by ±1.5 s.
        const dt = Math.abs(at - tick) / TICK_RATE;
        const strength = dt <= 0.4 ? 1 : Math.max(0, 1 - (dt - 0.4) / 1.1);
        drawFindingMarker(ctx, pos.x, pos.y, severity, at, strength, ui);
      }

      drawFlashOverlay(ctx, data.grenadeEvents, at, CLIP_SIZE, CLIP_SIZE, worldToCanvas, false);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
    [data, camera, cssWidth, radar, worldToCanvas, startTick, steamId, targetSteamId, tick, severity]
  );

  // Playback: advance the playhead in game time, loop with a short hold.
  useEffect(() => {
    if (status !== "ready") return;
    if (!playing || !visible) {
      draw(playhead.current);
      return;
    }
    let raf = 0;
    let last = performance.now();
    let holdUntil = 0;
    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      if (holdUntil) {
        if (now >= holdUntil) {
          holdUntil = 0;
          playhead.current = startTick;
        }
      } else {
        playhead.current += (dt / 1000) * TICK_RATE * speed;
        if (playhead.current >= endTick) {
          playhead.current = endTick;
          holdUntil = now + LOOP_PAUSE_MS;
        }
      }
      draw(playhead.current);
      setShownTick(Math.round(playhead.current));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [status, playing, visible, speed, draw, startTick, endTick]);

  const rel = (shownTick - tick) / TICK_RATE;
  const progress = (shownTick - startTick) / Math.max(1, endTick - startTick);
  const markAt = (tick - startTick) / Math.max(1, endTick - startTick);

  return (
    <div ref={wrapRef} className={cn("overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--canvas)]", className)}>
      <div className="relative aspect-square w-full">
        <canvas
          ref={canvasRef}
          width={CLIP_SIZE}
          height={CLIP_SIZE}
          role="img"
          aria-label={`Podgląd 2D: ${label}, mapa ${mapName}, runda ${roundNumber}`}
          className="block h-full w-full"
        />
        {status !== "ready" && (
          <button
            type="button"
            onClick={load}
            disabled={status === "loading"}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-cover bg-center text-sm font-semibold text-[var(--text-primary)]"
            style={mapConfig?.radarImage ? { backgroundImage: `linear-gradient(rgba(8,7,13,0.72), rgba(8,7,13,0.72)), url(${mapConfig.radarImage})` } : undefined}
          >
            {status === "loading" ? (
              <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" aria-hidden />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]">
                <Play className="ml-0.5 h-6 w-6" aria-hidden />
              </span>
            )}
            <span>
              {status === "loading" ? "Ładowanie…" : status === "error" ? "Brak danych replaya, spróbuj ponownie" : "Pokaż moment 2D"}
            </span>
          </button>
        )}
        {status === "ready" && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-md border border-[var(--border)] bg-[var(--glass-bg)] px-2 py-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)] backdrop-blur-md">
            {rel >= 0 ? "+" : "−"}
            {Math.abs(rel).toFixed(1)} s
          </span>
        )}
      </div>
      {status === "ready" && (
        <div className="flex items-center gap-2 border-t border-[var(--border)] px-2 py-1.5">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pauza" : "Odtwórz"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              playhead.current = startTick;
              setShownTick(startTick);
              draw(startTick);
            }}
            aria-label="Od początku"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-[var(--surface-3)]" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${progress * 100}%` }} />
            <span
              className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-[var(--mistake)]"
              style={{ left: `${markAt * 100}%` }}
            />
          </div>
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
            aria-label="Zmień prędkość"
            className="h-9 shrink-0 rounded-md px-2 font-mono text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          >
            {speed}×
          </button>
        </div>
      )}
    </div>
  );
}
