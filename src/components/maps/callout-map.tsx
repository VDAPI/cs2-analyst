"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  /** T lane into A / B ("" = none). */
  laneA: string;
  laneB: string;
  /** An admin corrected this callout. */
  edited: boolean;
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
  map,
  editable,
  options,
}: {
  config: RadarConfig;
  cellSize: number;
  cells: CalloutCell[];
  places: CalloutPlace[];
  map: string;
  /** Admins can correct names, CT positions and T lanes. */
  editable: boolean;
  /** Existing CT positions and lanes, suggested in the edit form. */
  options: { ctSpots: string[]; laneA: string[]; laneB: string[] };
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
  const selectedPlace = places.find((p) => p.raw === selected);

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
            ? `${info.human} → ${info.short}${info.ctSpot ? ` · CT: ${info.ctSpot}` : ""}${laneText(info) ? ` · T: ${laneText(info)}` : ""}`
            : "Najedź na kolorowe pole, żeby zobaczyć nazwę."}
        </p>
        {editable && selectedPlace && <CalloutEditor key={selectedPlace.raw} map={map} place={selectedPlace} options={options} />}
        {editable && !selectedPlace && (
          <p className="text-xs text-[var(--text-tertiary)]">Jako admin kliknij nazwę na liście, żeby ją poprawić.</p>
        )}
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
                <td>
                  {p.short}
                  {p.edited && <span className="ml-1 text-[var(--accent-2)]" title="Poprawione przez admina">✎</span>}
                </td>
                <td>{p.ctSpot || "—"}</td>
                <td>{laneText(p) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const laneText = (p: CalloutPlace) => [p.laneA && `A: ${p.laneA}`, p.laneB && `B: ${p.laneB}`].filter(Boolean).join(", ");

/** Admin form for one callout: name, CT position, T lane into A and B. */
function CalloutEditor({
  map,
  place,
  options,
}: {
  map: string;
  place: CalloutPlace;
  options: { ctSpots: string[]; laneA: string[]; laneB: string[] };
}) {
  const router = useRouter();
  const [name, setName] = useState(place.short);
  const [ctSpot, setCtSpot] = useState(place.ctSpot);
  const [laneA, setLaneA] = useState(place.laneA);
  const [laneB, setLaneB] = useState(place.laneB);
  const [status, setStatus] = useState("");

  const send = async (body: Record<string, string | null>) => {
    setStatus("Zapisuję…");
    const res = await fetch("/api/admin/callouts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ map, place: place.raw, ...body }),
    });
    setStatus(res.ok ? "Zapisane" : "Nie udało się zapisać");
    if (res.ok) router.refresh();
  };
  const input = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text-primary)]";
  const list = (id: string, values: string[]) => (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send({ name: name.trim(), ctSpot: ctSpot.trim(), laneA: laneA.trim(), laneB: laneB.trim() });
      }}
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">Popraw: {place.human}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          Nazwa w analizie
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          Pozycja CT (puste = żadna)
          <input className={input} list="ct-spots" value={ctSpot} onChange={(e) => setCtSpot(e.target.value)} maxLength={40} />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          Wejście T na A (puste = żadne)
          <input className={input} list="lanes-a" value={laneA} onChange={(e) => setLaneA(e.target.value)} maxLength={40} />
        </label>
        <label className="space-y-1 text-xs text-[var(--text-secondary)]">
          Wejście T na B (puste = żadne)
          <input className={input} list="lanes-b" value={laneB} onChange={(e) => setLaneB(e.target.value)} maxLength={40} />
        </label>
      </div>
      {list("ct-spots", options.ctSpots)}
      {list("lanes-a", options.laneA)}
      {list("lanes-b", options.laneB)}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--on-accent)]">
          Zapisz
        </button>
        {place.edited && (
          <button
            type="button"
            onClick={() => send({ name: null, ctSpot: null, laneA: null, laneB: null })}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)]"
          >
            Przywróć domyślne
          </button>
        )}
        <span className="text-xs text-[var(--text-tertiary)]">{status}</span>
      </div>
    </form>
  );
}
