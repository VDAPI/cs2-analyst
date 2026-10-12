"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Pause, Play, RotateCcw, X } from "lucide-react";
import { fetchRoundData, type RoundData } from "@/lib/replay/fetch-round";
import { makeWorldToCanvas, type RadarConfig } from "@/lib/canvas/radar";
import {
  drawClipFrame,
  drawExportOverlay,
  fixedCamera,
  followCamera,
  type ClipCamera,
  type ClipScene,
} from "@/lib/canvas/clip-render";
import { CANVAS_COLORS } from "@/lib/canvas/palette";
import { useRadarImage } from "@/components/maps/use-canvas";
import { TICK_RATE } from "@/stores/replay-store";
import { clipFileName, type ClipFormat } from "@/lib/clips/clip";
import { useT } from "@/lib/i18n/client";
import { Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/** Internal resolution of the clip canvas; drawing happens in the 1024 tool space. */
const CLIP_SIZE = 640;
/** Stored replay frames are 4 ticks apart; the clip uses all of them. */
const CLIP_INTERVAL = 4;
/** Hold on the last frame before looping. */
const LOOP_PAUSE_MS = 900;
/** Player dot radius on screen, in CSS px. */
const TARGET_DOT_CSS = 8;
/** Player dot in an exported file, as a share of its width (≈ 8 px at 360 px). */
const EXPORT_DOT_SHARE = 0.022;

export interface ClipExportInfo {
  /** Title burned into the file ("Clutch 1v3 · 3K"). */
  title: string;
  /** Second line (player, map, round). */
  subtitle: string;
  /** Map and round for the file name. */
  map: string;
  round: number;
}

export interface FindingClipProps {
  matchId: string;
  mapName: string;
  mapConfig: RadarConfig | null;
  roundNumber: number;
  /** The moment the clip is about (the mistake, the last kill). */
  tick: number;
  steamId: string;
  targetSteamId: string | null;
  severity: "high" | "medium" | "low";
  /** Seconds before and after the mistake. */
  clip: { before: number; after: number };
  /** Explicit tick window (highlights, S25); overrides `clip`. */
  range?: { from: number; to: number } | null;
  /** The camera follows the player instead of holding on the moment (highlights). */
  follow?: boolean;
  /** Ticks marked on the timeline in lime (a highlight's kills). */
  marks?: number[];
  /** Offers MP4/GIF download of the clip (S25). */
  exportInfo?: ClipExportInfo | null;
  /** Load (and play, unless reduced motion) as soon as the clip scrolls into view. */
  autoLoad?: boolean;
  /** Accessible description of the moment. */
  label: string;
  className?: string;
  /** Public link token, when the viewer doesn't own the match (S16). */
  share?: string | null;
  /** Draw the mistake marker at `tick` (off for a shared replay moment). */
  marker?: boolean;
  /** Map notes to pin on the clip (world coordinates). */
  notes?: Array<{ x: number; y: number; tick: number; label: string }>;
}

type Status = "idle" | "loading" | "ready" | "error";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);
  return reduced;
}

function fontVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/**
 * A few seconds of 2D replay around one moment: zoomed on the player (or
 * following them through a highlight), their view cone, the enemy it was
 * about, utility with timers, and a marker that lights up at the moment.
 * Loads its window of frames on demand and can be downloaded as MP4 or GIF.
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
  range = null,
  follow = false,
  marks,
  exportInfo = null,
  autoLoad = false,
  label,
  className,
  share = null,
  marker = true,
  notes,
}: FindingClipProps) {
  const t = useT();
  const toast = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<RoundData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [cssWidth, setCssWidth] = useState(320);
  const [visible, setVisible] = useState(false);
  const [menu, setMenu] = useState(false);
  const [exporting, setExporting] = useState<{ format: ClipFormat; progress: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const radar = useRadarImage(mapConfig?.radarImage);
  const worldToCanvas = useMemo(() => makeWorldToCanvas(mapConfig), [mapConfig]);

  const startTick = range ? range.from : tick - Math.round(clip.before * TICK_RATE);
  const endTick = range ? range.to : tick + Math.round(clip.after * TICK_RATE);
  const playhead = useRef(startTick);
  const [shownTick, setShownTick] = useState(startTick);

  const load = useCallback(() => {
    if (status === "loading" || status === "ready") return;
    setStatus("loading");
    fetchRoundData(matchId, roundNumber, { interval: CLIP_INTERVAL, from: startTick - CLIP_INTERVAL, to: endTick + CLIP_INTERVAL, share })
      .then((d) => {
        if (d.frames.length === 0) throw new Error("no frames");
        setData(d);
        setStatus("ready");
        if (!reducedMotion) setPlaying(true);
      })
      .catch(() => setStatus("error"));
  }, [status, matchId, roundNumber, startTick, endTick, reducedMotion, share]);

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

  useEffect(() => () => abortRef.current?.abort(), []);

  const scene = useMemo<ClipScene | null>(
    () =>
      data
        ? { data, worldToCanvas, radar, steamId, targetSteamId, severity, marker, focus: tick, from: startTick, notes }
        : null,
    [data, worldToCanvas, radar, steamId, targetSteamId, severity, marker, tick, startTick, notes]
  );
  const fixed = useMemo<ClipCamera | null>(() => (scene && !follow ? fixedCamera(scene) : null), [scene, follow]);
  const cameraAt = useCallback(
    (at: number): ClipCamera | null => (scene ? fixed ?? followCamera(scene, at) : null),
    [scene, fixed]
  );

  const draw = useCallback(
    (at: number) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const camera = cameraAt(at);
      if (!scene || !camera) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = CANVAS_COLORS.canvas;
        ctx.fillRect(0, 0, CLIP_SIZE, CLIP_SIZE);
        return;
      }
      drawClipFrame(ctx, CLIP_SIZE, scene, at, camera, TARGET_DOT_CSS * (CLIP_SIZE / Math.max(1, cssWidth)));
    },
    [scene, cameraAt, cssWidth]
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

  async function runExport(format: ClipFormat) {
    if (!scene || !exportInfo || exporting) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setExporting({ format, progress: 0 });
    try {
      const { exportClip, downloadBlob } = await import("@/lib/clips/export");
      const overlay = {
        title: exportInfo.title,
        subtitle: exportInfo.subtitle,
        brand: "CS2 ANALYST",
        displayFont: fontVar("--font-chakra-petch", "sans-serif"),
        monoFont: fontVar("--font-geist-mono", "monospace"),
      };
      let lastPct = -1;
      const result = await exportClip({
        format,
        from: startTick,
        to: endTick,
        signal: ctrl.signal,
        onProgress: (p) => {
          const pct = Math.floor(p * 100);
          if (pct !== lastPct) {
            lastPct = pct;
            setExporting({ format, progress: p });
          }
        },
        render: (ctx, size, at) => {
          const camera = cameraAt(at);
          if (!camera) return;
          drawClipFrame(ctx, size, scene, at, camera, size * EXPORT_DOT_SHARE);
          drawExportOverlay(ctx, size, { ...overlay, rel: (at - tick) / TICK_RATE }, scene.data, at);
        },
      });
      downloadBlob(result.blob, clipFileName({ map: exportInfo.map, round: exportInfo.round, label: exportInfo.title }, result.ext));
      toast({
        title: t("clips.player.done"),
        description: result.ext === "webm" ? t("clips.player.webmNote") : undefined,
        variant: "success",
      });
      setMenu(false);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.warn("[clip export]", err);
        toast({ title: format === "mp4" ? t("clips.player.failedVideo") : t("clips.player.failed"), variant: "error" });
      }
    } finally {
      abortRef.current = null;
      setExporting(null);
    }
  }

  const rel = (shownTick - tick) / TICK_RATE;
  const span = Math.max(1, endTick - startTick);
  const progress = (shownTick - startTick) / span;
  const markAt = (tick - startTick) / span;

  return (
    <div ref={wrapRef} className={cn("overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--canvas)]", className)}>
      <div className="relative aspect-square w-full">
        <canvas
          ref={canvasRef}
          width={CLIP_SIZE}
          height={CLIP_SIZE}
          role="img"
          aria-label={t("clips.player.aria", { label, map: mapName, round: roundNumber })}
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
              {status === "loading" ? t("common.loading") : status === "error" ? t("clips.player.noData") : t("clips.player.show")}
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
            aria-label={playing ? t("clips.player.pause") : t("clips.player.play")}
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
            aria-label={t("clips.player.restart")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-[var(--surface-3)]" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{ width: `${progress * 100}%` }} />
            {(marks ?? []).map((m) => (
              <span
                key={m}
                className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-[var(--accent-2)]"
                style={{ left: `${((m - startTick) / span) * 100}%` }}
              />
            ))}
            {(!marks || marks.length === 0) && (
              <span
                className={cn("absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full", marker ? "bg-[var(--mistake)]" : "bg-[var(--accent-2)]")}
                style={{ left: `${markAt * 100}%` }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}
            aria-label={t("clips.player.speed")}
            className="h-9 shrink-0 rounded-md px-2 font-mono text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          >
            {speed}×
          </button>
          {exportInfo && (
            <button
              type="button"
              onClick={() => setMenu((m) => !m)}
              aria-label={t("clips.player.download")}
              aria-expanded={menu}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]",
                menu ? "bg-[var(--surface-2)] text-[var(--accent-2)]" : "text-[var(--text-secondary)]"
              )}
            >
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {status === "ready" && exportInfo && menu && (
        <div className="space-y-2 border-t border-[var(--border)] px-2 py-2">
          {exporting ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--text-secondary)]" role="status">
                  {t("clips.player.recording", { format: exporting.format.toUpperCase() })}{" "}
                  <span className="font-mono tabular-nums">{Math.round(exporting.progress * 100)}%</span>
                </p>
                <div className="mt-1 h-1 rounded-full bg-[var(--surface-3)]">
                  <span className="block h-full rounded-full bg-[var(--accent-2)]" style={{ width: `${exporting.progress * 100}%` }} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                aria-label={t("common.cancel")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="primary" onClick={() => runExport("mp4")}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {t("clips.player.mp4")}
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => runExport("gif")}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {t("clips.player.gif")}
                </Button>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">{t("clips.player.hint")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
