"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Copy,
  Download,
  Eraser,
  Flame,
  Hand,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  Trash2,
  Type,
  Undo2,
  Zap,
  Cloud,
  Bomb,
} from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { useCanvasUiScale, useRadarImage } from "@/components/maps/use-canvas";
import { drawRadarBackground, TOOL_CANVAS_SIZE, type RadarConfig } from "@/lib/canvas/radar";
import { boardColor, drawBoardItems, hitBoardItem, interpolateItems, moveBoardItem } from "@/lib/canvas/board-draw";
import {
  BOARD_COLORS,
  MAX_ITEMS,
  MAX_STEPS,
  MAX_TEXT,
  newItemId,
  nextStep,
  q,
  simplifyStroke,
  type BoardColor,
  type BoardData,
  type BoardItem,
  type BoardUtility,
} from "@/lib/team/board";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils/cn";

export interface BoardMapOption {
  name: string;
  displayName: string;
  radar: RadarConfig;
}

type Tool = "move" | "ct" | "t" | BoardUtility | "arrow" | "draw" | "text" | "erase";

const TOOLS: Array<{ tool: Tool; icon: React.ComponentType<{ className?: string }> | null; label: MessageKey; dot?: string }> = [
  { tool: "move", icon: Hand, label: "teamBoard.toolMove" },
  { tool: "ct", icon: null, label: "teamBoard.toolCt", dot: "var(--ct-blue)" },
  { tool: "t", icon: null, label: "teamBoard.toolT", dot: "var(--t-gold)" },
  { tool: "SMOKE", icon: Cloud, label: "teamBoard.toolSmoke" },
  { tool: "FLASH", icon: Zap, label: "teamBoard.toolFlash" },
  { tool: "MOLOTOV", icon: Flame, label: "teamBoard.toolMolotov" },
  { tool: "HE", icon: Bomb, label: "teamBoard.toolHe" },
  { tool: "arrow", icon: ArrowUpRight, label: "teamBoard.toolArrow" },
  { tool: "draw", icon: Pencil, label: "teamBoard.toolDraw" },
  { tool: "text", icon: Type, label: "teamBoard.toolText" },
  { tool: "erase", icon: Eraser, label: "teamBoard.toolErase" },
];

const COLOR_LABEL: Record<BoardColor, MessageKey> = {
  ct: "teamBoard.colorCt",
  t: "teamBoard.colorT",
  accent: "teamBoard.colorViolet",
  lime: "teamBoard.colorLime",
  mistake: "teamBoard.colorRed",
  white: "teamBoard.colorWhite",
};

const HISTORY = 60;
const STEP_MS = 1300;

const selectClass =
  "h-10 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none max-md:min-h-11";

interface Props {
  teamId: string;
  board: {
    id: string;
    name: string;
    map: string;
    side: "CT" | "T" | null;
    data: BoardData;
    updatedAt: string;
  };
  canEdit: boolean;
  maps: BoardMapOption[];
}

export function TacticBoard({ teamId, board, canEdit, maps }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ui = useCanvasUiScale(canvasRef, 1, 720, 2.2);

  const [data, setData] = useState<BoardData>(board.data);
  const [name, setName] = useState(board.name);
  const [map, setMap] = useState(board.map);
  const [step, setStep] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [color, setColor] = useState<BoardColor>("lime");
  const [dashed, setDashed] = useState(false);
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ghost, setGhost] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(board.updatedAt);
  const [playing, setPlaying] = useState(false);
  const [anim, setAnim] = useState<{ from: number; to: number; t: number } | null>(null);
  const past = useRef<BoardData[]>([]);
  const future = useRef<BoardData[]>([]);
  const [, bump] = useState(0);

  const mapOption = maps.find((m) => m.name === map) ?? null;
  const radar = useRadarImage(mapOption?.radar.radarImage);
  const unitNorm = mapOption ? 1 / (mapOption.radar.scale * mapOption.radar.width) : 1 / 5120;
  const current = data.steps[Math.min(step, data.steps.length - 1)];
  const items = current.items;

  // ─── Editing ─────────────────────────────────────────
  const commit = useCallback((next: BoardData) => {
    setData((prev) => {
      past.current = [...past.current.slice(-HISTORY + 1), prev];
      future.current = [];
      return next;
    });
    setDirty(true);
    bump((n) => n + 1);
  }, []);

  const setItems = useCallback(
    (fn: (items: BoardItem[]) => BoardItem[]) => {
      commit({ ...data, steps: data.steps.map((s, i) => (i === step ? { ...s, items: fn(s.items) } : s)) });
    },
    [commit, data, step]
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(data);
    setData(prev);
    setStep((s) => Math.min(s, prev.steps.length - 1));
    setDirty(true);
    bump((n) => n + 1);
  }, [data]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(data);
    setData(next);
    setDirty(true);
    bump((n) => n + 1);
  }, [data]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    setItems((list) => list.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, setItems]);

  // ─── Saving ──────────────────────────────────────────
  const save = useCallback(
    async (force = false) => {
      if (!canEdit || saving) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/teams/${teamId}/boards/${board.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() || board.name, map, data, ...(force ? {} : { baseUpdatedAt }) }),
        });
        if (res.status === 409) {
          toast({ title: t("teamBoard.conflict"), description: t("teamBoard.conflictBody"), variant: "error" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const out = (await res.json()) as { updatedAt: string };
        setBaseUpdatedAt(out.updatedAt);
        setDirty(false);
        toast({ title: t("teamBoard.saved"), variant: "success" });
        router.refresh();
      } catch {
        toast({ title: t("common.error"), variant: "error" });
      } finally {
        setSaving(false);
      }
    },
    [baseUpdatedAt, board.id, board.name, canEdit, data, map, name, router, saving, t, teamId, toast]
  );

  async function duplicate() {
    const res = await fetch(`/api/teams/${teamId}/boards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${name}`.slice(0, 54) + " (2)", map, side: board.side, data }),
    });
    if (!res.ok) {
      toast({ title: res.status === 409 ? t("teamBoard.limit") : t("common.error"), variant: "error" });
      return;
    }
    const { id } = (await res.json()) as { id: string };
    router.push(`/team/${teamId}/boards/${id}`);
  }

  async function remove() {
    if (!window.confirm(t("teamBoard.deleteConfirm"))) return;
    const res = await fetch(`/api/teams/${teamId}/boards/${board.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ title: t("common.error"), variant: "error" });
      return;
    }
    setDirty(false);
    router.push(`/team/${teamId}/boards`);
    router.refresh();
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${(name || "board").replace(/[^\w-]+/g, "_")}-${step + 1}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }

  // Unsaved changes: warn before leaving, Ctrl+S / Ctrl+Z / Ctrl+Y / Delete.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, redo, removeSelected, save, selectedId, undo]);

  // ─── Steps ───────────────────────────────────────────
  function addStep() {
    if (data.steps.length >= MAX_STEPS) return;
    const steps = [...data.steps];
    steps.splice(step + 1, 0, nextStep(current, String(step + 2)));
    commit({ ...data, steps: steps.map((s, i) => (/^\d+$/.test(s.name) ? { ...s, name: String(i + 1) } : s)) });
    setStep(step + 1);
  }

  function deleteStep() {
    if (data.steps.length <= 1) return;
    const steps = data.steps.filter((_, i) => i !== step);
    commit({ ...data, steps: steps.map((s, i) => (/^\d+$/.test(s.name) ? { ...s, name: String(i + 1) } : s)) });
    setStep(Math.max(0, step - 1));
  }

  function updateStep(patch: { name?: string; note?: string }) {
    commit({ ...data, steps: data.steps.map((s, i) => (i === step ? { ...s, ...patch } : s)) });
  }

  // Playback: animate from each step to the next.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let from = step;
    let start = performance.now();
    if (from >= data.steps.length - 1) {
      from = 0;
      setStep(0);
    }
    const tick = (now: number) => {
      const k = (now - start) / STEP_MS;
      if (k >= 1) {
        const to = from + 1;
        setStep(to);
        if (to >= data.steps.length - 1) {
          setAnim(null);
          setPlaying(false);
          return;
        }
        from = to;
        start = now;
      }
      setAnim({ from, to: from + 1, t: Math.min(1, Math.max(0, (now - start) / STEP_MS)) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setAnim(null);
    };
    // Start / stop only; `step` is driven from inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // ─── Pointer input ───────────────────────────────────
  const drag = useRef<
    | { kind: "move"; id: string; last: [number, number]; moved: boolean; before: BoardData }
    | { kind: "stroke"; points: Array<[number, number]> }
    | null
  >(null);
  const [draft, setDraft] = useState<Array<[number, number]> | null>(null);

  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [q((e.clientX - rect.left) / rect.width), q((e.clientY - rect.top) / rect.height)];
  };
  /** Tap tolerance: ~22 CSS px whatever the canvas size. */
  const tolerance = (e: React.PointerEvent<HTMLCanvasElement>) => 22 / Math.max(1, e.currentTarget.getBoundingClientRect().width);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canEdit || playing) return;
    const [x, y] = toNorm(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = hitBoardItem(items, x, y, tolerance(e), unitNorm);

    if (tool === "erase") {
      if (hit) setItems((list) => list.filter((i) => i.id !== hit.id));
      return;
    }
    if (tool === "move") {
      setSelectedId(hit?.id ?? null);
      if (hit) drag.current = { kind: "move", id: hit.id, last: [x, y], moved: false, before: data };
      return;
    }
    if (tool === "arrow" || tool === "draw") {
      drag.current = { kind: "stroke", points: [[x, y]] };
      setDraft([[x, y]]);
      return;
    }
    if (items.length >= MAX_ITEMS) {
      toast({ title: t("teamBoard.full", { n: MAX_ITEMS }), variant: "error" });
      return;
    }
    const id = newItemId(data.steps.flatMap((s) => s.items.map((i) => i.id)));
    if (tool === "ct" || tool === "t") {
      const side = tool === "ct" ? "CT" : "T";
      const used = new Set(items.filter((i) => i.kind === "player" && i.side === side).map((i) => (i.kind === "player" ? i.label : "")));
      let n = 1;
      while (used.has(String(n))) n++;
      setItems((list) => [...list, { id, kind: "player", side, label: String(n), x, y }]);
      setSelectedId(id);
    } else if (tool === "text") {
      const value = text.trim().slice(0, MAX_TEXT);
      if (!value) {
        toast({ title: t("teamBoard.textFirst"), variant: "error" });
        return;
      }
      setItems((list) => [...list, { id, kind: "text", color, text: value, x, y }]);
    } else {
      setItems((list) => [...list, { id, kind: "util", type: tool, x, y }]);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    const [x, y] = toNorm(e);
    if (d.kind === "stroke") {
      d.points.push([x, y]);
      setDraft([...d.points]);
      return;
    }
    const [lx, ly] = d.last;
    if (!d.moved && Math.hypot(x - lx, y - ly) < 0.004) return;
    d.moved = true;
    d.last = [x, y];
    // Live drag without filling the undo history; one entry is added on release.
    setData((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) =>
        i === step ? { ...s, items: s.items.map((it) => (it.id === d.id ? moveBoardItem(it, x - lx, y - ly) : it)) } : s
      ),
    }));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "move") {
      if (d.moved) {
        past.current = [...past.current.slice(-HISTORY + 1), d.before];
        future.current = [];
        setDirty(true);
        bump((n) => n + 1);
      }
      return;
    }
    setDraft(null);
    const pts = simplifyStroke(d.points);
    const [x0, y0] = pts[0];
    const [x1, y1] = pts[pts.length - 1];
    if (pts.length < 2 || (pts.length === 2 && Math.hypot(x1 - x0, y1 - y0) < 0.01)) return;
    if (items.length >= MAX_ITEMS) {
      toast({ title: t("teamBoard.full", { n: MAX_ITEMS }), variant: "error" });
      return;
    }
    const id = newItemId(data.steps.flatMap((s) => s.items.map((i) => i.id)));
    setItems((list) => [
      ...list,
      tool === "arrow" ? { id, kind: "arrow", color, points: pts, ...(dashed ? { dashed: true } : {}) } : { id, kind: "line", color, points: pts },
    ]);
  }

  // ─── Drawing ─────────────────────────────────────────
  const shown = useMemo(() => {
    if (anim) return interpolateItems(data.steps[anim.from].items, data.steps[anim.to].items, anim.t);
    return items;
  }, [anim, data.steps, items]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = canvas.width;
    drawRadarBackground(ctx, radar, 0.85, mapOption?.displayName ?? map);
    const opts = { size, ui, unitPx: unitNorm * size, selectedId: anim ? null : selectedId };
    if (ghost && !anim && step > 0) {
      const prevItems = data.steps[step - 1].items.filter((i) => i.kind === "player" || i.kind === "util");
      drawBoardItems(ctx, prevItems, { ...opts, selectedId: null, alpha: 0.28 });
    }
    drawBoardItems(ctx, shown, opts);
    if (draft && draft.length > 1) {
      drawBoardItems(
        ctx,
        [tool === "arrow" ? { id: "draft", kind: "arrow", color, points: draft, dashed } : { id: "draft", kind: "line", color, points: draft }],
        opts
      );
    }
  }, [anim, color, dashed, data.steps, draft, ghost, map, mapOption, radar, selectedId, shown, step, tool, ui, unitNorm]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const stepCount = data.steps.length;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-3">
        {canEdit && (
          <div role="toolbar" aria-label={t("teamBoard.tools")} className="flex flex-wrap gap-1.5">
            {TOOLS.map(({ tool: k, icon: Icon, label, dot }) => (
              <button
                key={k}
                type="button"
                onClick={() => setTool(k)}
                aria-pressed={tool === k}
                title={t(label)}
                className={cn(
                  "flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors max-md:min-h-11 max-md:min-w-11",
                  tool === k
                    ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                {Icon ? (
                  <Icon className="h-4 w-4" aria-hidden />
                ) : (
                  <span aria-hidden className="h-3.5 w-3.5 rounded-full border border-[var(--text-primary)]" style={{ background: dot }} />
                )}
                <span className="sr-only sm:not-sr-only">{t(label)}</span>
              </button>
            ))}
          </div>
        )}

        {canEdit && (tool === "arrow" || tool === "draw" || tool === "text") && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--text-tertiary)]">{t("teamBoard.color")}</span>
            {BOARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={t(COLOR_LABEL[c])}
                title={t(COLOR_LABEL[c])}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-transform max-md:h-10 max-md:w-10",
                  color === c ? "scale-110 border-[var(--text-primary)]" : "border-transparent"
                )}
                style={{ background: boardColor(c) }}
              />
            ))}
            {tool === "arrow" && (
              <label className="ml-1 flex min-h-10 items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input type="checkbox" checked={dashed} onChange={(e) => setDashed(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                {t("teamBoard.dashed")}
              </label>
            )}
            {tool === "text" && (
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_TEXT}
                placeholder={t("teamBoard.textPlaceholder")}
                aria-label={t("teamBoard.toolText")}
                className="h-10 w-full max-w-[240px] py-0"
              />
            )}
          </div>
        )}

        <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
          <canvas
            ref={canvasRef}
            width={TOOL_CANVAS_SIZE}
            height={TOOL_CANVAS_SIZE}
            aria-label={t("teamBoard.canvasLabel", { map: mapOption?.displayName ?? map })}
            role="img"
            className={cn("block aspect-square w-full", canEdit && "cursor-crosshair")}
            style={{ touchAction: canEdit ? "none" : "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-[rgba(8,7,13,0.75)] px-2 py-1 font-mono text-xs text-[var(--text-secondary)]">
            {t("teamBoard.stepOf", { n: step + 1, total: stepCount })}
          </span>
        </div>

        {/* Steps */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={t("teamBoard.steps")}>
          {data.steps.map((s, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              onClick={() => {
                setPlaying(false);
                setStep(i);
                setSelectedId(null);
              }}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 font-mono text-sm transition-colors max-md:min-h-11 max-md:min-w-11",
                i === step
                  ? "border-[var(--border-active)] bg-[var(--accent)] text-[var(--on-accent)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
              )}
            >
              {s.name || i + 1}
            </button>
          ))}
          {canEdit && stepCount < MAX_STEPS && (
            <Button variant="secondary" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("teamBoard.addStep")}
            </Button>
          )}
          {stepCount > 1 && (
            <Button variant="secondary" size="sm" onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              {playing ? t("teamBoard.pause") : t("teamBoard.play")}
            </Button>
          )}
        </div>
      </div>

      {/* Side panel */}
      <aside className="min-w-0 space-y-4">
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <label className="block space-y-1">
            <span className="label-overline text-[var(--text-tertiary)]">{t("teamBoard.name")}</span>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              maxLength={60}
              disabled={!canEdit}
            />
          </label>
          <label className="block space-y-1">
            <span className="label-overline text-[var(--text-tertiary)]">{t("teamBoard.map")}</span>
            <select
              value={map}
              disabled={!canEdit}
              onChange={(e) => {
                setMap(e.target.value);
                setDirty(true);
              }}
              className={cn(selectClass, "w-full")}
            >
              {maps.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          {canEdit && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="cta" onClick={() => void save()} disabled={saving || !dirty}>
                <Save className="h-4 w-4" aria-hidden />
                {saving ? t("common.saving") : dirty ? t("common.save") : t("common.saved")}
              </Button>
              <Button variant="secondary" size="icon" onClick={undo} disabled={past.current.length === 0} aria-label={t("teamBoard.undo")} title={t("teamBoard.undo")}>
                <Undo2 className="h-4 w-4" aria-hidden />
              </Button>
              <Button variant="secondary" size="icon" onClick={redo} disabled={future.current.length === 0} aria-label={t("teamBoard.redo")} title={t("teamBoard.redo")}>
                <Redo2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
          <p className="label-overline text-[var(--text-tertiary)]">{t("teamBoard.stepTitle", { n: step + 1 })}</p>
          {canEdit ? (
            <>
              <Input
                value={current.name}
                onChange={(e) => updateStep({ name: e.target.value.slice(0, 40) })}
                aria-label={t("teamBoard.stepName")}
                placeholder={t("teamBoard.stepName")}
              />
              <textarea
                value={current.note ?? ""}
                onChange={(e) => updateStep({ note: e.target.value.slice(0, 400) })}
                rows={3}
                placeholder={t("teamBoard.stepNotePlaceholder")}
                aria-label={t("teamBoard.stepNote")}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-4)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-disabled)] focus:border-[var(--accent)] focus:outline-none"
              />
            </>
          ) : (
            current.note && <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{current.note}</p>
          )}
          <label className="flex min-h-10 items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            {t("teamBoard.ghost")}
          </label>
          {canEdit && stepCount > 1 && (
            <Button variant="ghost" size="sm" onClick={deleteStep}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("teamBoard.deleteStep")}
            </Button>
          )}
        </div>

        {canEdit && selected && (
          <div className="space-y-2 rounded-xl border border-[var(--border-active)] bg-[var(--surface-1)] p-3">
            <p className="label-overline text-[var(--text-tertiary)]">{t("teamBoard.selected")}</p>
            {selected.kind === "player" && (
              <Input
                value={selected.label}
                maxLength={16}
                aria-label={t("teamBoard.playerLabel")}
                placeholder={t("teamBoard.playerLabel")}
                onChange={(e) => setItems((list) => list.map((i) => (i.id === selected.id && i.kind === "player" ? { ...i, label: e.target.value } : i)))}
              />
            )}
            {selected.kind === "text" && (
              <Input
                value={selected.text}
                maxLength={MAX_TEXT}
                aria-label={t("teamBoard.toolText")}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value.trim()) setItems((list) => list.map((i) => (i.id === selected.id && i.kind === "text" ? { ...i, text: value } : i)));
                }}
              />
            )}
            <Button variant="danger" size="sm" onClick={removeSelected}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("common.remove")}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportPng}>
            <Download className="h-4 w-4" aria-hidden />
            {t("teamBoard.exportPng")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void duplicate()}>
            <Copy className="h-4 w-4" aria-hidden />
            {t("teamBoard.duplicate")}
          </Button>
          {canEdit && (
            <Button variant="danger" size="sm" onClick={() => void remove()}>
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("teamBoard.delete")}
            </Button>
          )}
        </div>
        {canEdit && <p className="text-xs text-[var(--text-tertiary)]">{t("teamBoard.hint")}</p>}
        {!canEdit && <p className="text-xs text-[var(--text-tertiary)]">{t("teamBoard.readOnly")}</p>}
      </aside>
    </div>
  );
}
