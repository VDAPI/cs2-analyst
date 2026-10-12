/**
 * Tactic board drawing (S17). Items are in normalised radar coordinates
 * (src/lib/team/board.ts); this turns them into canvas pixels. Colors mirror
 * the Violet Lime tokens via CANVAS_COLORS / GRENADE_STYLE.
 */
import type { BoardColor, BoardItem } from "@/lib/team/board";
import { CANVAS_COLORS, grenadeStyle } from "./palette";

export const BOARD_PLAYER_RADIUS = 15;

const COLOR: Record<BoardColor, string> = {
  ct: CANVAS_COLORS.ct,
  t: CANVAS_COLORS.t,
  accent: CANVAS_COLORS.accent,
  lime: CANVAS_COLORS.accent2,
  mistake: CANVAS_COLORS.mistake,
  white: CANVAS_COLORS.textPrimary,
};
export const boardColor = (c: BoardColor) => COLOR[c];

/** Radius on the map of a smoke / molotov, in world units (CS2). */
const SMOKE_UNITS = 144;
const MOLOTOV_UNITS = 120;

export interface BoardDrawOpts {
  /** Canvas side in pixels (square). */
  size: number;
  /** Marker size factor (useCanvasUiScale). */
  ui: number;
  /** World units → canvas pixels (radar scale), for utility radii. */
  unitPx: number;
  selectedId?: string | null;
  /** 0–1: drawn faded (previous-step ghost). */
  alpha?: number;
}

function polyline(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, size: number) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * size, y * size) : ctx.lineTo(x * size, y * size)));
}

function arrowHead(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, size: number, len: number) {
  const [x2, y2] = pts[pts.length - 1];
  // Direction from a point a little back along the path (freehand ends wobble).
  let i = pts.length - 2;
  while (i > 0 && Math.hypot((pts[i][0] - x2) * size, (pts[i][1] - y2) * size) < len) i--;
  const [x1, y1] = pts[Math.max(0, i)];
  const a = Math.atan2((y2 - y1) * size, (x2 - x1) * size);
  const tx = x2 * size;
  const ty = y2 * size;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - len * Math.cos(a - 0.45), ty - len * Math.sin(a - 0.45));
  ctx.lineTo(tx - len * Math.cos(a + 0.45), ty - len * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, px: number) {
  ctx.font = `600 ${px}px "Geist", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, px / 4);
  ctx.strokeStyle = CANVAS_COLORS.canvas;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function drawBoardItem(ctx: CanvasRenderingContext2D, item: BoardItem, o: BoardDrawOpts) {
  const { size, ui } = o;
  const selected = o.selectedId === item.id;
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (item.kind) {
    case "line":
    case "arrow": {
      const color = COLOR[item.color];
      if (selected) {
        ctx.strokeStyle = CANVAS_COLORS.accent2;
        ctx.globalAlpha = (o.alpha ?? 1) * 0.35;
        ctx.lineWidth = 12 * ui;
        polyline(ctx, item.points, size);
        ctx.stroke();
        ctx.globalAlpha = o.alpha ?? 1;
      }
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = (item.kind === "arrow" ? 4 : 3.5) * ui;
      if (item.kind === "arrow" && item.dashed) ctx.setLineDash([12 * ui, 9 * ui]);
      polyline(ctx, item.points, size);
      ctx.stroke();
      ctx.setLineDash([]);
      if (item.kind === "arrow") arrowHead(ctx, item.points, size, 16 * ui);
      break;
    }
    case "util": {
      const x = item.x * size;
      const y = item.y * size;
      const style = grenadeStyle(item.type);
      const r =
        item.type === "SMOKE"
          ? Math.max(14 * ui, SMOKE_UNITS * o.unitPx)
          : item.type === "MOLOTOV"
            ? Math.max(12 * ui, MOLOTOV_UNITS * o.unitPx)
            : 9 * ui;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.strokeStyle = style.line;
      ctx.lineWidth = 2 * ui;
      if (item.type === "FLASH") {
        // A small burst.
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
          ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6);
        }
      }
      ctx.stroke();
      if (selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = CANVAS_COLORS.accent2;
        ctx.stroke();
      }
      outlinedText(ctx, item.type === "MOLOTOV" ? "M" : item.type[0], x, y, style.line, 12 * ui);
      break;
    }
    case "player": {
      const x = item.x * size;
      const y = item.y * size;
      const r = BOARD_PLAYER_RADIUS * ui;
      const color = item.side === "CT" ? CANVAS_COLORS.ct : CANVAS_COLORS.t;
      if (selected) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6 * ui, 0, Math.PI * 2);
        ctx.strokeStyle = CANVAS_COLORS.accent2;
        ctx.lineWidth = 3 * ui;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = CANVAS_COLORS.textPrimary;
      ctx.lineWidth = 1.5 * ui;
      ctx.stroke();
      const short = item.label.length <= 2;
      ctx.font = `700 ${14 * ui}px "Geist Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = CANVAS_COLORS.canvas;
      if (short) ctx.fillText(item.label, x, y + 0.5 * ui);
      else outlinedText(ctx, item.label, x, y + r + 12 * ui, CANVAS_COLORS.textPrimary, 13 * ui);
      break;
    }
    case "text": {
      outlinedText(ctx, item.text, item.x * size, item.y * size, COLOR[item.color], 18 * ui);
      if (selected) {
        const w = ctx.measureText(item.text).width;
        ctx.strokeStyle = CANVAS_COLORS.accent2;
        ctx.lineWidth = 2 * ui;
        ctx.strokeRect(item.x * size - w / 2 - 6 * ui, item.y * size - 14 * ui, w + 12 * ui, 28 * ui);
      }
      break;
    }
  }
  ctx.restore();
}

/** Draw order: drawings and utility under the players, text on top. */
const LAYER: Record<BoardItem["kind"], number> = { util: 0, line: 1, arrow: 2, player: 3, text: 4 };

export function drawBoardItems(ctx: CanvasRenderingContext2D, items: BoardItem[], o: BoardDrawOpts) {
  for (const item of [...items].sort((a, b) => LAYER[a.kind] - LAYER[b.kind])) drawBoardItem(ctx, item, o);
}

/** Squared distance from p to segment ab (all normalised). */
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Topmost item under a normalised point, or null. `tol` is the hit radius in
 * normalised units (tap slop grows on small screens).
 */
export function hitBoardItem(items: BoardItem[], x: number, y: number, tol: number, unitNorm: number): BoardItem | null {
  const sorted = [...items].sort((a, b) => LAYER[b.kind] - LAYER[a.kind]);
  for (const item of sorted) {
    switch (item.kind) {
      case "player":
      case "text":
        if (Math.hypot(item.x - x, item.y - y) <= tol * (item.kind === "text" ? 1.6 : 1.2)) return item;
        break;
      case "util": {
        const r = item.type === "SMOKE" ? SMOKE_UNITS * unitNorm : item.type === "MOLOTOV" ? MOLOTOV_UNITS * unitNorm : 0;
        if (Math.hypot(item.x - x, item.y - y) <= Math.max(tol, r)) return item;
        break;
      }
      case "line":
      case "arrow":
        for (let i = 1; i < item.points.length; i++) {
          if (segDist([x, y], item.points[i - 1], item.points[i]) <= tol * 0.7) return item;
        }
        break;
    }
  }
  return null;
}

/** Item moved by (dx, dy), clamped to the map. */
export function moveBoardItem(item: BoardItem, dx: number, dy: number): BoardItem {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000;
  if (item.kind === "line" || item.kind === "arrow") {
    return { ...item, points: item.points.map(([x, y]) => [c(x + dx), c(y + dy)] as [number, number]) };
  }
  return { ...item, x: c(item.x + dx), y: c(item.y + dy) };
}

/** Positions of `to`'s tokens part-way from where the same ids stood in `from` (step playback). */
export function interpolateItems(from: BoardItem[], to: BoardItem[], t: number): BoardItem[] {
  const prev = new Map(from.map((i) => [i.id, i]));
  const k = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in-out
  return to.map((item) => {
    const p = prev.get(item.id);
    if (!p || p.kind !== item.kind || (item.kind !== "player" && item.kind !== "util")) return item;
    const pp = p as Extract<BoardItem, { x: number }>;
    return { ...item, x: pp.x + (item.x - pp.x) * k, y: pp.y + (item.y - pp.y) * k };
  });
}
