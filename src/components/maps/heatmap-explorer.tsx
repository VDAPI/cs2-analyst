"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Skull, X } from "lucide-react";
import { Card } from "@/components/ui";
import { MapViewport } from "./map-viewport";
import { useCanvasUiScale, useRadarImage } from "./use-canvas";
import { ToolHeader } from "@/components/tools/tool-header";
import { ControlGroup, Segmented, ToggleRow, ToolSelect } from "@/components/tools/segmented";
import { CANVAS_COLORS } from "@/lib/canvas/palette";
import { drawEmptyHint, drawRadarBackground, makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import { drawHeatmapLayer, HEATMAP_LEGEND_GRADIENT } from "@/lib/canvas/heatmap-layer";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/formatters";

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

type HeatmapType = "kills" | "deaths";
type SideFilter = "all" | "CT" | "T";

export type HeatmapSource =
  | { kind: "match"; matchId: string; scoreCT: number; scoreT: number }
  | { kind: "map"; matches: MatchInfo[] };

interface HeatmapExplorerProps {
  source: HeatmapSource;
  mapName: string;
  mapRaw: string;
  mapConfig: RadarConfig | null;
  players: PlayerInfo[];
}

const TAP_RADIUS = 28;

/** Kill/death heatmap for one match or for all of the user's matches on a map. */
export function HeatmapExplorer({ source, mapName, mapRaw, mapConfig, players }: HeatmapExplorerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radar = useRadarImage(mapConfig?.radarImage ?? `/maps/${mapRaw}_radar.png`);
  const worldToCanvas = useMemo(() => makeWorldToCanvas(mapConfig), [mapConfig]);
  const [zoom, setZoom] = useState(1);
  const ui = useCanvasUiScale(canvasRef, zoom);

  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [heatmapType, setHeatmapType] = useState<HeatmapType>("kills");
  const [sideFilter, setSideFilter] = useState<SideFilter>("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [showDots, setShowDots] = useState(true);
  const [picked, setPicked] = useState<HeatmapPoint | null>(null);

  const allMatches = source.kind === "map" ? source.matches : [];
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(() => new Set(allMatches.map((m) => m.id)));

  const matchKey = source.kind === "match" ? source.matchId : [...selectedMatches].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setPicked(null);
    const params = new URLSearchParams({ type: heatmapType });
    if (sideFilter !== "all") params.set("side", sideFilter);
    if (playerFilter !== "all") params.set("player", playerFilter);

    let url: string;
    if (source.kind === "match") {
      url = `/api/matches/${source.matchId}/heatmap?${params}`;
    } else {
      params.set("map", mapRaw);
      if (selectedMatches.size > 0 && selectedMatches.size < allMatches.length) {
        params.set("matches", [...selectedMatches].join(","));
      }
      url = `/api/heatmap?${params}`;
    }

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPoints(data.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // matchKey stands in for the source / selected matches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey, mapRaw, heatmapType, sideFilter, playerFilter]);

  const canvasPoints = useMemo(() => points.map((p) => worldToCanvas(p.x, p.y)), [points, worldToCanvas]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    drawRadarBackground(ctx, radar, 0.5, mapName);
    if (points.length === 0) {
      drawEmptyHint(ctx, isLoading ? "Ładowanie…" : "Brak danych dla tych filtrów");
      return;
    }

    drawHeatmapLayer(ctx, canvasPoints);

    if (showDots) {
      const dot = heatmapType === "kills" ? CANVAS_COLORS.mistake : CANVAS_COLORS.deathGray;
      for (let i = 0; i < canvasPoints.length; i++) {
        const cp = canvasPoints[i];
        const p = points[i];
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, (p.headshot ? 5 : 3.5) * ui, 0, Math.PI * 2);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = dot;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (p.headshot) {
          ctx.strokeStyle = CANVAS_COLORS.accent2;
          ctx.lineWidth = 1.5 * ui;
          ctx.stroke();
        }
      }
    }

    if (picked) {
      const i = points.indexOf(picked);
      const cp = canvasPoints[i];
      if (cp) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, 14 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = CANVAS_COLORS.accent;
        ctx.lineWidth = 3 * ui;
        ctx.shadowColor = CANVAS_COLORS.accent;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [points, canvasPoints, radar, showDots, heatmapType, picked, mapName, isLoading, ui]);

  const onTap = ({ x, y }: { x: number; y: number }) => {
    let best = -1;
    let bestDist = TAP_RADIUS * ui;
    canvasPoints.forEach((cp, i) => {
      const d = Math.hypot(cp.x - x, cp.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setPicked(best >= 0 ? points[best] : null);
  };

  const toggleMatch = (id: string) => {
    setSelectedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else next.add(id);
      return next;
    });
  };

  const toggleAllMatches = () => {
    setSelectedMatches(
      selectedMatches.size === allMatches.length
        ? new Set(allMatches.slice(0, 1).map((m) => m.id))
        : new Set(allMatches.map((m) => m.id))
    );
  };

  const ctPlayers = players.filter((p) => p.team === "CT");
  const tPlayers = players.filter((p) => p.team === "T");
  const headshots = points.filter((p) => p.headshot).length;
  const typeLabel = heatmapType === "kills" ? "Zabójstwa" : "Śmierci";

  return (
    <div className="flex flex-col gap-4">
      <ToolHeader
        backHref="/heatmaps"
        backLabel="Heatmapy"
        overline={source.kind === "map" ? "Heatmapa zbiorcza" : "Heatmapa meczu"}
        title={mapName}
        scoreCT={source.kind === "match" ? source.scoreCT : undefined}
        scoreT={source.kind === "match" ? source.scoreT : undefined}
        loading={isLoading}
        meta={
          source.kind === "map" ? (
            <span className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[13px] tabular-nums text-[var(--text-tertiary)]">
              {selectedMatches.size}/{allMatches.length} meczów
            </span>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,720px)_minmax(260px,1fr)] lg:items-start">
        <div className="min-w-0 space-y-2">
          <MapViewport
            onZoomChange={setZoom}
            canvasRef={canvasRef}
            size={TOOL_CANVAS_SIZE}
            onTap={onTap}
            label={`Heatmapa: ${typeLabel.toLowerCase()} na mapie ${mapName}`}
          >
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-3 py-2 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-tertiary)]">mało</span>
                <span className="h-2 w-20 rounded-full sm:w-24" style={{ background: HEATMAP_LEGEND_GRADIENT }} />
                <span className="text-[11px] text-[var(--text-tertiary)]">dużo</span>
              </div>
            </div>
          </MapViewport>

          {picked ? (
            <div className="flex items-center gap-3 rounded-lg border border-[var(--border-active)] bg-[var(--surface-2)] px-3 py-2 text-sm">
              <span className="truncate font-mono text-[var(--text-primary)]">{picked.name}</span>
              <span className="text-[var(--text-tertiary)]">{picked.weapon}</span>
              {picked.headshot && (
                <span className="rounded-full bg-[var(--accent-2-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-2)]">HS</span>
              )}
              <button
                type="button"
                onClick={() => setPicked(null)}
                aria-label="Zamknij"
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--text-tertiary)]">
              Dotknij punktu, aby zobaczyć gracza i broń. Przybliżaj dwoma palcami lub przyciskami.
            </p>
          )}
        </div>

        <Card className="space-y-5">
          <ControlGroup label="Rodzaj">
            <Segmented<HeatmapType>
              label="Rodzaj heatmapy"
              value={heatmapType}
              onChange={setHeatmapType}
              options={[
                { value: "kills", label: <><Crosshair className="h-3.5 w-3.5" />Zabójstwa</>, tone: "mistake" },
                { value: "deaths", label: <><Skull className="h-3.5 w-3.5" />Śmierci</>, tone: "neutral" },
              ]}
            />
          </ControlGroup>

          <ControlGroup label="Strona">
            <Segmented<SideFilter>
              label="Strona"
              value={sideFilter}
              onChange={setSideFilter}
              options={[
                { value: "all", label: "Obie" },
                { value: "CT", label: "CT", tone: "ct" },
                { value: "T", label: "T", tone: "t" },
              ]}
            />
          </ControlGroup>

          <ControlGroup label="Gracz">
            <ToolSelect value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)} aria-label="Gracz">
              <option value="all">Wszyscy gracze</option>
              {ctPlayers.length > 0 && (
                <optgroup label="CT">
                  {ctPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>{p.name}</option>
                  ))}
                </optgroup>
              )}
              {tPlayers.length > 0 && (
                <optgroup label="T">
                  {tPlayers.map((p) => (
                    <option key={p.steamId} value={p.steamId}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </ToolSelect>
          </ControlGroup>

          {source.kind === "map" && (
            <ControlGroup label="Mecze">
              <button
                type="button"
                onClick={toggleAllMatches}
                className="mb-2 min-h-9 w-full rounded-md bg-[var(--surface-2)] px-2 text-[13px] font-semibold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
              >
                {selectedMatches.size === allMatches.length ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
              </button>
              <div className="max-h-[200px] space-y-1 overflow-y-auto">
                {allMatches.map((m) => {
                  const on = selectedMatches.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMatch(m.id)}
                      className={cn(
                        "flex min-h-9 w-full items-center justify-between rounded-md px-2 text-left text-[13px] transition-colors duration-150",
                        on
                          ? "bg-[var(--accent-muted)] text-[var(--text-primary)]"
                          : "text-[var(--text-disabled)] hover:bg-[var(--surface-2)] hover:text-[var(--text-tertiary)]"
                      )}
                    >
                      <span>{formatDate(m.date)}</span>
                      <span className="font-mono tabular-nums">{m.scoreCT}:{m.scoreT}</span>
                    </button>
                  );
                })}
              </div>
            </ControlGroup>
          )}

          <ToggleRow label="Pokaż pojedyncze zdarzenia" checked={showDots} onChange={setShowDots} />

          <div className="grid grid-cols-2 gap-2 border-t border-[var(--divider)] pt-4">
            <div>
              <p className="label-overline text-[var(--text-tertiary)]">{typeLabel}</p>
              <p className="font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">{points.length}</p>
            </div>
            <div>
              <p className="label-overline text-[var(--text-tertiary)]">Headshoty</p>
              <p className="font-mono text-xl font-bold tabular-nums text-[var(--accent-2)]">
                {headshots}
                {points.length > 0 && (
                  <span className="ml-1 text-sm text-[var(--text-tertiary)]">
                    {Math.round((headshots / points.length) * 100)}%
                  </span>
                )}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
