"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { drawRadarBackground, makeCanvasToWorld, makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import { useRadarImage } from "./use-canvas";
import { cn } from "@/lib/utils/cn";

export interface CalloutCell {
  /** Cell centre, world units. */
  x: number;
  y: number;
  place: string;
}

export interface CalloutPlace {
  raw: string;
  human: string;
  short: string;
  ctSpot: string;
  tLane: string;
  /** Sample-weighted centre, world units (label position). */
  x: number;
  y: number;
  samples: number;
}

/** A distinct colour per place (golden-angle hues). */
const colourOf = (i: number, alpha: number) => `hsla(${Math.round((i * 137.508) % 360)}, 75%, 58%, ${alpha})`;

/** Radar with each demo callout's cells coloured and labelled (/callouts). */
export function CalloutMap({
  config,
  cellSize,
  cells,
  places,
}: {
  config: RadarConfig;
  cellSize: number;
  cells: CalloutCell[];
  places: CalloutPlace[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radar = useRadarImage(config.radarImage);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const index = useMemo(() => new Map(places.map((p, i) => [p.raw, i])), [places]);
  const toCanvas = useMemo(() => makeWorldToCanvas(config), [config]);
  const toWorld = useMemo(() => makeCanvasToWorld(config), [config]);
  const cellPx = (cellSize / config.scale) * (TOOL_CANVAS_SIZE / config.width);
  const focus = selected ?? hover;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawRadarBackground(ctx, radar, 0.9, "");
    for (const c of cells) {
      const i = index.get(c.place) ?? 0;
      const p = toCanvas(c.x - cellSize / 2, c.y + cellSize / 2);
      const dim = focus && focus !== c.place;
      ctx.fillStyle = colourOf(i, dim ? 0.06 : focus ? 0.6 : 0.35);
      ctx.fillRect(p.x, p.y, cellPx, cellPx);
    }
    ctx.font = `600 13px "Chakra Petch", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of places) {
      if (focus && focus !== p.raw) continue;
      const c = toCanvas(p.x, p.y);
      const label = p.short === p.human ? p.human : `${p.short} (${p.human})`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(label, c.x, c.y);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, c.x, c.y);
    }
  }, [radar, cells, places, index, toCanvas, cellPx, cellSize, focus]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = toWorld(((e.clientX - rect.left) / rect.width) * TOOL_CANVAS_SIZE, ((e.clientY - rect.top) / rect.height) * TOOL_CANVAS_SIZE);
    const cx = Math.floor(w.x / cellSize);
    const cy = Math.floor(w.y / cellSize);
    const hit = cells.find((c) => Math.floor(c.x / cellSize) === cx && Math.floor(c.y / cellSize) === cy);
    setHover(hit?.place ?? null);
  };

  const info = places.find((p) => p.raw === focus);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-2">
        <canvas
          ref={canvasRef}
          width={TOOL_CANVAS_SIZE}
          height={TOOL_CANVAS_SIZE}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          className="aspect-square w-full rounded-xl border border-[var(--border)]"
        />
        <p className="min-h-6 text-sm text-[var(--text-secondary)]">
          {info
            ? `${info.human} → ${info.short}${info.ctSpot ? ` · CT: ${info.ctSpot}` : ""}${info.tLane ? ` · T: ${info.tLane}` : ""}`
            : "Najedź na kolorowe pole, żeby zobaczyć nazwę."}
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th>Z dema</th>
              <th>W analizie</th>
              <th>CT</th>
              <th>Wejście T</th>
            </tr>
          </thead>
          <tbody>
            {places.map((p) => (
              <tr
                key={p.raw}
                onClick={() => setSelected(selected === p.raw ? null : p.raw)}
                className={cn("cursor-pointer", selected === p.raw && "bg-[var(--accent-muted)]")}
              >
                <td className="whitespace-nowrap">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: colourOf(index.get(p.raw) ?? 0, 0.9) }} />
                  {p.human}
                </td>
                <td>{p.short}</td>
                <td>{p.ctSpot || "—"}</td>
                <td>{p.tLane || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
