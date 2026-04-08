"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Crosshair, Skull } from "lucide-react";

interface MapConfigData {
  posX: number;
  posY: number;
  scale: number;
  width: number;
  height: number;
  radarImage: string;
}

interface PlayerInfo {
  steamId: string;
  name: string;
  team: "CT" | "T";
}

interface MatchInfo {
  id: string;
  date: string;
  scoreCT: number;
  scoreT: number;
}

interface HeatmapPoint {
  x: number;
  y: number;
  name: string;
  weapon: string;
  headshot: boolean;
}

interface CrossMatchHeatmapProps {
  mapName: string;
  mapRaw: string;
  mapConfig: MapConfigData | null;
  matches: MatchInfo[];
  players: PlayerInfo[];
}

type HeatmapType = "kills" | "deaths";
type SideFilter = "all" | "CT" | "T";

const CANVAS_SIZE = 1024;

export function CrossMatchHeatmap({
  mapName,
  mapRaw,
  mapConfig,
  matches,
  players,
}: CrossMatchHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [radarImage, setRadarImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [heatmapType, setHeatmapType] = useState<HeatmapType>("kills");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [playerFilter, setPlayerFilter] = useState<string>("all");
  const [showDots, setShowDots] = useState(true);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(
    () => new Set(matches.map((m) => m.id))
  );

  // Load radar image
  useEffect(() => {
    const src = mapConfig?.radarImage ?? `/maps/${mapRaw}_radar.png`;
    const img = new Image();
    img.src = src;
    img.onload = () => setRadarImage(img);
  }, [mapConfig?.radarImage, mapRaw]);

  // Fetch heatmap data from cross-match API
  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ map: mapRaw, type: heatmapType });
    if (sideFilter !== "all") params.set("side", sideFilter);
    if (playerFilter !== "all") params.set("player", playerFilter);

    const matchIds = Array.from(selectedMatches);
    if (matchIds.length > 0 && matchIds.length < matches.length) {
      params.set("matches", matchIds.join(","));
    }

    fetch(`/api/heatmap?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setPoints(data.points ?? []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [mapRaw, heatmapType, sideFilter, playerFilter, selectedMatches, matches.length]);

  // World -> canvas coordinates
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

  // Draw heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, w, h);

    if (radarImage) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.filter = "grayscale(100%)";
      ctx.drawImage(radarImage, 0, 0, w, h);
      ctx.restore();
    }

    if (points.length === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.font = '16px "Geist Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No data for current filters", w / 2, h / 2);
      return;
    }

    const canvasPoints = points.map((p) => worldToCanvas(p.x, p.y));

    drawHeatmapLayer(ctx, canvasPoints, w, h);

    if (showDots) {
      for (let i = 0; i < canvasPoints.length; i++) {
        const cp = canvasPoints[i];
        const p = points[i];
        const dotColor = heatmapType === "kills" ? "rgba(239, 68, 68, 0.7)" : "rgba(107, 114, 128, 0.7)";

        ctx.beginPath();
        ctx.arc(cp.x, cp.y, p.headshot ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        if (p.headshot) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }, [points, radarImage, worldToCanvas, showDots, heatmapType]);

  const ctPlayers = players.filter((p) => p.team === "CT");
  const tPlayers = players.filter((p) => p.team === "T");

  const toggleMatch = (matchId: string) => {
    setSelectedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        if (next.size > 1) next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  };

  const toggleAllMatches = () => {
    if (selectedMatches.size === matches.length) {
      // Keep only first match
      setSelectedMatches(new Set([matches[0].id]));
    } else {
      setSelectedMatches(new Set(matches.map((m) => m.id)));
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/heatmaps"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {mapName} — Heatmap
          </h1>
          <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 font-mono text-xs text-[var(--text-tertiary)]">
            {selectedMatches.size}/{matches.length} matches
          </span>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <span className="text-xs text-[var(--text-tertiary)]">Loading...</span>
          </div>
        )}
      </div>

      {/* Canvas + Controls */}
      <div className="flex flex-1 gap-4">
        {/* Canvas */}
        <div className="relative aspect-square w-full max-w-[700px] flex-shrink-0 overflow-hidden rounded-xl border border-[var(--border)] shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="h-full w-full"
          />
          {/* Legend overlay */}
          <div className="absolute bottom-3 left-3 rounded-lg bg-[rgba(15,15,18,0.85)] px-3 py-2 backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Intensity
            </p>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-[var(--text-tertiary)]">Low</span>
              <div className="h-2 w-24 rounded-full" style={{
                background: "linear-gradient(to right, rgba(59,130,246,0.3), rgba(34,197,94,0.5), rgba(251,191,36,0.7), rgba(239,68,68,0.9))"
              }} />
              <span className="text-[9px] text-[var(--text-tertiary)]">High</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-[var(--text-secondary)]">
              {points.length} {heatmapType}
            </p>
          </div>
        </div>

        {/* Controls sidebar */}
        <div className="flex min-w-[240px] flex-col gap-3 overflow-y-auto">
          {/* Type selector */}
          <ControlPanel label="Heatmap Type">
            <div className="flex gap-2">
              <button
                onClick={() => setHeatmapType("kills")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  heatmapType === "kills"
                    ? "bg-[rgba(239,68,68,0.15)] text-[#ef4444]"
                    : "bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                Kills
              </button>
              <button
                onClick={() => setHeatmapType("deaths")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 ${
                  heatmapType === "deaths"
                    ? "bg-[rgba(107,114,128,0.15)] text-[#6b7280]"
                    : "bg-[var(--surface-2)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Skull className="h-3.5 w-3.5" />
                Deaths
              </button>
            </div>
          </ControlPanel>

          {/* Side filter */}
          <ControlPanel label="Side">
            <div className="flex gap-1">
              {(["all", "CT", "T"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSideFilter(s)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-150 ${
                    sideFilter === s
                      ? s === "CT"
                        ? "bg-[var(--ct-blue-muted)] text-[var(--ct-blue)]"
                        : s === "T"
                          ? "bg-[var(--t-gold-muted)] text-[var(--t-gold)]"
                          : "bg-[var(--accent-muted)] text-[var(--accent)]"
                      : "text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {s === "all" ? "All" : s}
                </button>
              ))}
            </div>
          </ControlPanel>

          {/* Player filter */}
          <ControlPanel label="Player">
            <select
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="all">All Players</option>
              {ctPlayers.length > 0 && (
                <optgroup label="CT">
                  {ctPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {tPlayers.length > 0 && (
                <optgroup label="T">
                  {tPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </ControlPanel>

          {/* Match selector */}
          <ControlPanel label="Matches">
            <div className="space-y-1.5">
              <button
                onClick={toggleAllMatches}
                className="mb-1 w-full rounded-md bg-[var(--surface-2)] px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
              >
                {selectedMatches.size === matches.length ? "Deselect All" : "Select All"}
              </button>
              <div className="max-h-[180px] space-y-1 overflow-y-auto">
                {matches.map((m) => {
                  const isSelected = selectedMatches.has(m.id);
                  return (
                    <button
                      key={m.id}
                      onClick={() => toggleMatch(m.id)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-all duration-150 ${
                        isSelected
                          ? "bg-[var(--accent-muted)] text-[var(--text-primary)]"
                          : "text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-tertiary)]"
                      }`}
                    >
                      <span>{new Date(m.date).toLocaleDateString()}</span>
                      <span className="font-mono text-[10px]">
                        {m.scoreCT}:{m.scoreT}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </ControlPanel>

          {/* Show dots toggle */}
          <ControlPanel label="">
            <label className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">Show individual events</span>
              <button
                onClick={() => setShowDots(!showDots)}
                className={`relative h-5 w-9 rounded-full transition-colors duration-150 ${
                  showDots ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform duration-150 ${
                    showDots ? "translate-x-4" : ""
                  }`}
                />
              </button>
            </label>
          </ControlPanel>

          {/* Stats summary */}
          <ControlPanel label="Summary">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Matches</span>
                <span className="font-mono text-[var(--text-primary)]">{selectedMatches.size}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Total {heatmapType}</span>
                <span className="font-mono text-[var(--text-primary)]">{points.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Headshots</span>
                <span className="font-mono text-[#f59e0b]">
                  {points.filter((p) => p.headshot).length}
                </span>
              </div>
            </div>
          </ControlPanel>
        </div>
      </div>
    </div>
  );
}

function ControlPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      {label && (
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

// ─── Heatmap rendering ──────────────────────────────────

function drawHeatmapLayer(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number
) {
  if (typeof OffscreenCanvas === "undefined") return;

  const offscreen = new OffscreenCanvas(width, height);
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) return;

  const radius = 35;

  for (const p of points) {
    const gradient = offCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.4)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    offCtx.fillStyle = gradient;
    offCtx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  }

  const imageData = offCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    const intensity = Math.min(alpha / 180, 1);
    const color = interpolateColor(intensity);
    data[i] = color.r;
    data[i + 1] = color.g;
    data[i + 2] = color.b;
    data[i + 3] = Math.round(color.a * 255);
  }

  offCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.drawImage(offscreen, 0, 0);
  ctx.filter = "none";
  ctx.restore();
}

function interpolateColor(t: number): { r: number; g: number; b: number; a: number } {
  const stops = [
    { t: 0, r: 59, g: 130, b: 246, a: 0 },
    { t: 0.25, r: 59, g: 130, b: 246, a: 0.2 },
    { t: 0.5, r: 34, g: 197, b: 94, a: 0.4 },
    { t: 0.75, r: 251, g: 191, b: 36, a: 0.6 },
    { t: 1.0, r: 239, g: 68, b: 68, a: 0.8 },
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.t - lower.t;
  const factor = range === 0 ? 0 : (t - lower.t) / range;

  return {
    r: Math.round(lower.r + (upper.r - lower.r) * factor),
    g: Math.round(lower.g + (upper.g - lower.g) * factor),
    b: Math.round(lower.b + (upper.b - lower.b) * factor),
    a: lower.a + (upper.a - lower.a) * factor,
  };
}
