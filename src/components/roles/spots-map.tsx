"use client";

import { useEffect, useRef, useState } from "react";
import { MapViewport } from "@/components/maps/map-viewport";
import { useCanvasUiScale, useRadarImage } from "@/components/maps/use-canvas";
import { CANVAS_COLORS } from "@/lib/canvas/palette";
import { drawRadarBackground, makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import { useT } from "@/lib/i18n/client";

type Spot = [number, number, number];

/**
 * Setup spots (S24): where the player (violet) and the pro (lime) stand 20 s
 * after freeze end, one dot per round, on the map's radar.
 */
export function SpotsMap({
  mapRaw,
  mapName,
  mapConfig,
  mine,
  pro,
  proName,
}: {
  mapRaw: string;
  mapName: string;
  mapConfig: RadarConfig | null;
  mine: Spot[];
  pro: Spot[];
  proName: string;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const radar = useRadarImage(mapConfig?.radarImage ?? `/maps/${mapRaw}_radar.png`);
  const ui = useCanvasUiScale(canvasRef, zoom);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawRadarBackground(ctx, radar, 0.5, mapName);
    const toCanvas = makeWorldToCanvas(mapConfig);
    const draw = (spots: Spot[], fill: string, square: boolean) => {
      const r = 9 * ui;
      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = CANVAS_COLORS.canvas;
      ctx.lineWidth = 2 * ui;
      ctx.globalAlpha = 0.85;
      for (const [x, y] of spots) {
        const p = toCanvas(x, y);
        ctx.beginPath();
        if (square) ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
        else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    };
    draw(pro, CANVAS_COLORS.accent2, true);
    draw(mine, CANVAS_COLORS.accent, false);
  }, [radar, mapConfig, mapName, mine, pro, ui]);

  return (
    <MapViewport
      onZoomChange={setZoom}
      canvasRef={canvasRef}
      size={TOOL_CANVAS_SIZE}
      label={`${t("roles.positionsTitle")}: ${mapName}`}
    >
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--glass-bg)] px-3 py-2 text-[11px] text-[var(--text-secondary)] backdrop-blur-md">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden />
          {t("roles.legendYou")} <span className="font-mono">{mine.length}</span>
        </span>
        <span className="flex max-w-[160px] items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 bg-[var(--accent-2)]" aria-hidden />
          <span className="truncate">{proName}</span> <span className="font-mono">{pro.length}</span>
        </span>
      </div>
    </MapViewport>
  );
}
