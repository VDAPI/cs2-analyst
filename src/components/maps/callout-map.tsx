"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { drawRadarBackground, makeCanvasToWorld, makeWorldToCanvas, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import { insidePolygon, type Zone } from "@/lib/team/zones";
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

type Options = { ctSpots: string[]; laneA: string[]; laneB: string[] };
type Selection = { kind: "place"; raw: string } | { kind: "zone"; id: string } | null;

/** A distinct colour per place (golden-angle hues). */
const colourOf = (i: number, alpha: number) => `hsla(${Math.round((i * 137.508) % 360)}, 75%, 58%, ${alpha})`;
const ZONE = "rgba(196, 255, 77, 0.95)";

const centroid = (pts: Array<[number, number]>) => ({
  x: pts.reduce((s, p) => s + p[0], 0) / pts.length,
  y: pts.reduce((s, p) => s + p[1], 0) / pts.length,
});

/**
 * Radar with each demo callout's cells coloured and labelled, plus the zones
 * an admin drew (/callouts). Admins correct callouts and draw, edit or delete
 * zones here.
 */
export function CalloutMap({
  config,
  cellSize,
  cells,
  places,
  map,
  zones,
  editable,
  options,
}: {
  config: RadarConfig;
  cellSize: number;
  cells: CalloutCell[];
  places: CalloutPlace[];
  map: string;
  zones: Zone[];
  /** Admins can correct names, CT positions and T lanes, and draw zones. */
  editable: boolean;
  /** Existing CT positions and lanes, suggested in the edit forms. */
  options: Options;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radar = useRadarImage(config.radarImage);
  const [selected, setSelected] = useState<Selection>(null);
  const [hover, setHover] = useState<Selection>(null);
  /** Points of the zone being drawn (world units); null = not drawing. */
  const [draft, setDraft] = useState<Array<[number, number]> | null>(null);
  const [draftDone, setDraftDone] = useState(false);
  const index = useMemo(() => new Map(places.map((p, i) => [p.raw, i])), [places]);
  const toCanvas = useMemo(() => makeWorldToCanvas(config), [config]);
  const toWorld = useMemo(() => makeCanvasToWorld(config), [config]);
  const cellPx = (cellSize / config.scale) * (TOOL_CANVAS_SIZE / config.width);
  const focus = selected ?? hover;
  const focusPlace = focus?.kind === "place" ? focus.raw : null;
  const focusZone = focus?.kind === "zone" ? focus.id : null;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawRadarBackground(ctx, radar, 0.9, "");
    const anyFocus = focusPlace || focusZone;
    for (const c of cells) {
      const i = index.get(c.place) ?? 0;
      const p = toCanvas(c.x - cellSize / 2, c.y + cellSize / 2);
      const dim = anyFocus && focusPlace !== c.place;
      ctx.fillStyle = colourOf(i, dim ? 0.05 : focusPlace ? 0.6 : 0.3);
      ctx.fillRect(p.x, p.y, cellPx, cellPx);
    }
    ctx.font = `600 13px "Chakra Petch", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = (text: string, x: number, y: number, colour = "#fff") => {
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(text, x, y);
      ctx.fillStyle = colour;
      ctx.fillText(text, x, y);
    };
    for (const p of places) {
      if (anyFocus && focusPlace !== p.raw) continue;
      const c = toCanvas(p.x, p.y);
      label(p.short === p.human ? p.human : `${p.short} (${p.human})`, c.x, c.y);
    }
    const path = (pts: Array<[number, number]>, close: boolean) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const c = toCanvas(x, y);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      if (close) ctx.closePath();
    };
    // Drawn zones on top: outline, light fill, name.
    for (const z of zones) {
      if (anyFocus && focusZone !== z.id) continue;
      path(z.points, true);
      ctx.fillStyle = focusZone === z.id ? "rgba(196,255,77,0.35)" : "rgba(196,255,77,0.15)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ZONE;
      ctx.stroke();
      const c = centroid(z.points);
      const cc = toCanvas(c.x, c.y);
      label(z.name, cc.x, cc.y, ZONE);
    }
    if (draft && draft.length > 0) {
      path(draft, draftDone);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const [x, y] of draft) {
        const c = toCanvas(x, y);
        ctx.fillStyle = "#fff";
        ctx.fillRect(c.x - 3, c.y - 3, 6, 6);
      }
    }
  }, [radar, cells, places, zones, index, toCanvas, cellPx, cellSize, focusPlace, focusZone, draft, draftDone]);

  // Drawing from the keyboard: Enter finishes, Backspace drops the last corner, Escape cancels.
  useEffect(() => {
    if (!draft || draftDone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Enter" && draft.length >= 3) setDraftDone(true);
      else if (e.key === "Backspace") setDraft(draft.slice(0, -1));
      else if (e.key === "Escape") setDraft(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, draftDone]);

  const worldAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return toWorld(((e.clientX - rect.left) / rect.width) * TOOL_CANVAS_SIZE, ((e.clientY - rect.top) / rect.height) * TOOL_CANVAS_SIZE);
  };
  const hitAt = (w: { x: number; y: number }): Selection => {
    const zone = zones.find((z) => insidePolygon(w.x, w.y, z.points));
    if (zone) return { kind: "zone", id: zone.id };
    const cx = Math.floor(w.x / cellSize);
    const cy = Math.floor(w.y / cellSize);
    const cell = cells.find((c) => Math.floor(c.x / cellSize) === cx && Math.floor(c.y / cellSize) === cy);
    return cell ? { kind: "place", raw: cell.place } : null;
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draft) return;
    setHover(hitAt(worldAt(e)));
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = worldAt(e);
    if (draft) {
      if (!draftDone) setDraft([...draft, [Math.round(w.x), Math.round(w.y)]]);
      return;
    }
    setSelected(hitAt(w));
  };

  const hoverText = (() => {
    if (focusZone) {
      const z = zones.find((x) => x.id === focusZone);
      return z ? `Strefa ${z.name}${z.ctSpot ? ` · CT: ${z.ctSpot}` : ""}${laneText(z) ? ` · T: ${laneText(z)}` : ""}` : "";
    }
    const p = places.find((x) => x.raw === focusPlace);
    return p ? `${p.human} → ${p.short}${p.ctSpot ? ` · CT: ${p.ctSpot}` : ""}${laneText(p) ? ` · T: ${laneText(p)}` : ""}` : "";
  })();
  const selectedPlace = selected?.kind === "place" ? places.find((p) => p.raw === selected.raw) : undefined;
  const selectedZone = selected?.kind === "zone" ? zones.find((z) => z.id === selected.id) : undefined;
  const allOptions: Options = {
    ctSpots: [...new Set([...options.ctSpots, ...zones.map((z) => z.ctSpot).filter(Boolean)])],
    laneA: [...new Set([...options.laneA, ...zones.map((z) => z.laneA).filter(Boolean)])],
    laneB: [...new Set([...options.laneB, ...zones.map((z) => z.laneB).filter(Boolean)])],
  };
  const button = "rounded-lg px-3 py-1.5 text-sm disabled:opacity-40";
  const primary = cn(button, "bg-[var(--accent)] font-semibold text-[var(--on-accent)]");
  const secondary = cn(button, "border border-[var(--border)] text-[var(--text-secondary)]");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-2">
        {editable && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {!draft ? (
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setDraft([]);
                  setDraftDone(false);
                }}
                className={primary}
              >
                Narysuj strefę
              </button>
            ) : (
              <>
                <span className="text-[var(--text-secondary)]">
                  {draftDone
                    ? "Nazwij strefę w panelu obok."
                    : `Klikaj rogi strefy (${draft.length} pkt). Enter kończy, Backspace cofa, Esc anuluje.`}
                </span>
                {!draftDone && (
                  <>
                    <button type="button" disabled={draft.length < 3} onClick={() => setDraftDone(true)} className={primary}>
                      Gotowe
                    </button>
                    <button type="button" disabled={draft.length === 0} onClick={() => setDraft(draft.slice(0, -1))} className={secondary}>
                      Cofnij punkt
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setDraft(null)} className={secondary}>
                  Anuluj
                </button>
              </>
            )}
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={TOOL_CANVAS_SIZE}
          height={TOOL_CANVAS_SIZE}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onPointerDown={onPointerDown}
          className={cn("aspect-square w-full touch-none rounded-xl border border-[var(--border)]", draft && !draftDone && "cursor-crosshair")}
        />
        <p className="min-h-6 text-sm text-[var(--text-secondary)]">{hoverText || "Najedź na pole, żeby zobaczyć nazwę."}</p>
      </div>
      {/* Right column stays next to the map: the form first, then the lists, scrolling inside. */}
      <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
        {editable && draft && draftDone && (
          <ZoneEditor
            map={map}
            options={allOptions}
            create={{ points: draft }}
            onDone={() => {
              setDraft(null);
              setDraftDone(false);
            }}
          />
        )}
        {editable && !draft && selectedZone && (
          <ZoneEditor key={selectedZone.id} map={map} options={allOptions} zone={selectedZone} onDone={() => setSelected(null)} />
        )}
        {editable && !draft && selectedPlace && <CalloutEditor key={selectedPlace.raw} map={map} place={selectedPlace} options={allOptions} />}
        {editable && !draft && !selected && (
          <p className="text-xs text-[var(--text-tertiary)]">
            Jako admin: „Narysuj strefę” dodaje własną pozycję (np. Ninja, Kitchen). Strefy mają pierwszeństwo przed nazwami z dema. Kliknij
            strefę albo nazwę, żeby ją poprawić.
          </p>
        )}

        {zones.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th>Strefa</th>
                  <th>CT</th>
                  <th>Wejście T</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr
                    key={z.id}
                    onClick={() => setSelected(selected?.kind === "zone" && selected.id === z.id ? null : { kind: "zone", id: z.id })}
                    className={cn("cursor-pointer", focusZone === z.id && "bg-[var(--accent-muted)]")}
                  >
                    <td className="whitespace-nowrap font-medium text-[var(--accent-2)]">{z.name}</td>
                    <td>{z.ctSpot || "—"}</td>
                    <td>{laneText(z) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  onClick={() => setSelected(selected?.kind === "place" && selected.raw === p.raw ? null : { kind: "place", raw: p.raw })}
                  className={cn("cursor-pointer", focusPlace === p.raw && "bg-[var(--accent-muted)]")}
                >
                  <td className="whitespace-nowrap">
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                      style={{ background: colourOf(index.get(p.raw) ?? 0, 0.9) }}
                    />
                    {p.human}
                  </td>
                  <td>
                    {p.short}
                    {p.edited && (
                      <span className="ml-1 text-[var(--accent-2)]" title="Poprawione przez admina">
                        ✎
                      </span>
                    )}
                  </td>
                  <td>{p.ctSpot || "—"}</td>
                  <td>{laneText(p) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const laneText = (p: { laneA: string; laneB: string }) =>
  [p.laneA && `A: ${p.laneA}`, p.laneB && `B: ${p.laneB}`].filter(Boolean).join(", ");

const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm text-[var(--text-primary)]";

interface FieldState {
  name: string;
  setName: (v: string) => void;
  ctSpot: string;
  setCtSpot: (v: string) => void;
  laneA: string;
  setLaneA: (v: string) => void;
  laneB: string;
  setLaneB: (v: string) => void;
}

function useFields(init: { name: string; ctSpot: string; laneA: string; laneB: string }): FieldState {
  const [name, setName] = useState(init.name);
  const [ctSpot, setCtSpot] = useState(init.ctSpot);
  const [laneA, setLaneA] = useState(init.laneA);
  const [laneB, setLaneB] = useState(init.laneB);
  return { name, setName, ctSpot, setCtSpot, laneA, setLaneA, laneB, setLaneB };
}

/** Name, CT position and T lanes: the fields shared by a callout and a zone. */
function GroupingFields({ f, options, nameLabel }: { f: FieldState; options: Options; nameLabel: string }) {
  const field = (label: string, value: string, set: (v: string) => void, list?: string) => (
    <label className="space-y-1 text-xs text-[var(--text-secondary)]">
      {label}
      <input className={inputClass} list={list} value={value} onChange={(e) => set(e.target.value)} maxLength={40} />
    </label>
  );
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {field(nameLabel, f.name, f.setName)}
      {field("Pozycja CT (puste = żadna)", f.ctSpot, f.setCtSpot, "ct-spots")}
      {field("Wejście T na A (puste = żadne)", f.laneA, f.setLaneA, "lanes-a")}
      {field("Wejście T na B (puste = żadne)", f.laneB, f.setLaneB, "lanes-b")}
      {(
        [
          ["ct-spots", options.ctSpots],
          ["lanes-a", options.laneA],
          ["lanes-b", options.laneB],
        ] as const
      ).map(([id, values]) => (
        <datalist key={id} id={id}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
    </div>
  );
}

const fieldsBody = (f: FieldState) => ({ name: f.name.trim(), ctSpot: f.ctSpot.trim(), laneA: f.laneA.trim(), laneB: f.laneB.trim() });

/** Admin form for one demo callout: name, CT position, T lane into A and B. */
function CalloutEditor({ map, place, options }: { map: string; place: CalloutPlace; options: Options }) {
  const router = useRouter();
  const f = useFields({ name: place.short, ctSpot: place.ctSpot, laneA: place.laneA, laneB: place.laneB });
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

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(fieldsBody(f));
      }}
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">Popraw: {place.human}</p>
      <GroupingFields f={f} options={options} nameLabel="Nazwa w analizie" />
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

/** Admin form for a drawn zone: a new one (with its points) or an existing one (rename, regroup, delete). */
function ZoneEditor({
  map,
  options,
  zone,
  create,
  onDone,
}: {
  map: string;
  options: Options;
  zone?: Zone;
  create?: { points: Array<[number, number]> };
  onDone: () => void;
}) {
  const router = useRouter();
  const f = useFields({ name: zone?.name ?? "", ctSpot: zone?.ctSpot ?? "", laneA: zone?.laneA ?? "", laneB: zone?.laneB ?? "" });
  const [status, setStatus] = useState("");

  const save = async () => {
    if (!f.name.trim()) {
      setStatus("Podaj nazwę strefy");
      return;
    }
    setStatus("Zapisuję…");
    const res = zone
      ? await fetch(`/api/admin/zones/${zone.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fieldsBody(f)),
        })
      : await fetch("/api/admin/zones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ map, points: create!.points, ...fieldsBody(f) }),
        });
    if (!res.ok) {
      setStatus("Nie udało się zapisać");
      return;
    }
    router.refresh();
    onDone();
  };
  const remove = async () => {
    if (!zone || !window.confirm(`Usunąć strefę ${zone.name}?`)) return;
    const res = await fetch(`/api/admin/zones/${zone.id}`, { method: "DELETE" });
    if (!res.ok) {
      setStatus("Nie udało się usunąć");
      return;
    }
    router.refresh();
    onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3"
    >
      <p className="text-sm font-semibold text-[var(--text-primary)]">{zone ? `Strefa: ${zone.name}` : "Nowa strefa"}</p>
      <GroupingFields f={f} options={options} nameLabel="Nazwa strefy (np. Ninja)" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--on-accent)]">
          Zapisz
        </button>
        {zone && (
          <button type="button" onClick={remove} className="rounded-lg border border-[var(--mistake)] px-3 py-1.5 text-sm text-[var(--mistake)]">
            Usuń strefę
          </button>
        )}
        <span className="text-xs text-[var(--text-tertiary)]">{status}</span>
      </div>
    </form>
  );
}
