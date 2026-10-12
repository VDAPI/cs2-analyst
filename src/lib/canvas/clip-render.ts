/**
 * One frame of a 2D clip (S10 finding clips, S25 highlights and exports):
 * the zoomed radar, utility, kills, players with view cones, the finding
 * marker and map notes. Shared by the on-page clip (FindingClip) and the
 * MP4/GIF exporter, so a downloaded clip looks exactly like the preview.
 * Browser-only (Canvas 2D), no React.
 */
import type { RoundData } from "@/lib/replay/fetch-round";
import type { PlayerSnapshot, TickFrame } from "@/stores/replay-store";
import { TOOL_CANVAS_SIZE } from "./radar";
import { CANVAS_COLORS } from "./palette";
import {
  VIEW_CONE_UNITS,
  drawActiveFires,
  drawActiveSmokes,
  drawFindingMarker,
  drawFlashOverlay,
  drawHEExplosions,
  drawKillMarker,
  drawNotePin,
  drawPlayer,
  drawPlayerLoadout,
  drawSightLine,
  drawUtilityTimers,
  drawViewCone,
} from "./replay-draw";

const TICK_RATE = 64;

type WorldToCanvas = (x: number, y: number) => { x: number; y: number };

export interface ClipScene {
  data: RoundData;
  worldToCanvas: WorldToCanvas;
  radar: HTMLImageElement | null;
  steamId: string;
  targetSteamId: string | null;
  severity: "high" | "medium" | "low";
  /** Draw the finding marker at `focus`. */
  marker: boolean;
  focus: number;
  from: number;
  notes?: Array<{ x: number; y: number; tick: number; label: string }>;
}

export interface ClipCamera {
  cx: number;
  cy: number;
  zoom: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpYaw(a: number, b: number, t: number) {
  let d = ((b - a + 540) % 360) - 180;
  if (d === -180) d = 180;
  return a + d * t;
}

/** Players at `tick`, interpolated between the two surrounding frames. */
export function playersAt(frames: TickFrame[], tick: number): PlayerSnapshot[] {
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

function clampCamera(cx: number, cy: number, zoom: number): ClipCamera {
  const half = TOOL_CANVAS_SIZE / zoom / 2;
  return {
    cx: Math.min(TOOL_CANVAS_SIZE - half, Math.max(half, cx)),
    cy: Math.min(TOOL_CANVAS_SIZE - half, Math.max(half, cy)),
    zoom,
  };
}

/** Finding clips: centred on the player at the mistake (and the enemy, if close enough to fit). */
export function fixedCamera(scene: ClipScene): ClipCamera {
  const { data, focus, steamId, targetSteamId, worldToCanvas } = scene;
  const at = playersAt(data.frames, focus);
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
  return clampCamera(cx, cy, zoom);
}

/** Zoom of the following camera (highlights move across the map). */
export const FOLLOW_ZOOM = 2.1;
/** Seconds of movement averaged on each side, so the camera glides instead of shaking. */
const FOLLOW_SMOOTH_S = 1.2;

/**
 * Highlights: follows the player, smoothed over the frames around `at`.
 * After their death the camera stays where they fell.
 */
export function followCamera(scene: ClipScene, at: number): ClipCamera {
  const { data, steamId, worldToCanvas } = scene;
  const span = FOLLOW_SMOOTH_S * TICK_RATE;
  let sx = 0;
  let sy = 0;
  let n = 0;
  let lastAlive: PlayerSnapshot | null = null;
  for (const f of data.frames) {
    const p = f.players.find((q) => q.steamId === steamId);
    if (!p) continue;
    if (p.isAlive && f.tick <= at) lastAlive = p;
    if (!p.isAlive || f.tick < at - span || f.tick > at + span) continue;
    const c = worldToCanvas(p.x, p.y);
    sx += c.x;
    sy += c.y;
    n++;
  }
  if (n === 0) {
    const p = lastAlive ?? playersAt(data.frames, at).find((q) => q.steamId === steamId);
    if (!p) return { cx: TOOL_CANVAS_SIZE / 2, cy: TOOL_CANVAS_SIZE / 2, zoom: 1 };
    const c = worldToCanvas(p.x, p.y);
    return clampCamera(c.x, c.y, FOLLOW_ZOOM);
  }
  return clampCamera(sx / n, sy / n, FOLLOW_ZOOM);
}

/**
 * Draws the clip at game tick `at` on a `size`×`size` canvas. `dotPx` is the
 * on-canvas size of a player dot, so markers stay readable at any output size.
 */
export function drawClipFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  scene: ClipScene,
  at: number,
  camera: ClipCamera,
  dotPx: number
) {
  const { data, worldToCanvas, radar, steamId, targetSteamId, severity, marker, focus, from, notes } = scene;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = CANVAS_COLORS.canvas;
  ctx.fillRect(0, 0, size, size);

  const k = (size / TOOL_CANVAS_SIZE) * camera.zoom;
  ctx.setTransform(k, 0, 0, k, size / 2 - camera.cx * k, size / 2 - camera.cy * k);
  const ui = Math.min(3, Math.max(0.35, dotPx / (12 * k)));

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
    if (kill.tick > at || kill.tick < from - 3 * TICK_RATE) continue;
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
    const dt = Math.abs(at - focus) / TICK_RATE;
    const strength = dt <= 0.4 ? 1 : Math.max(0, 1 - (dt - 0.4) / 1.1);
    if (marker) drawFindingMarker(ctx, pos.x, pos.y, severity, at, strength, ui);
  }
  for (const n of notes ?? []) {
    const pos = worldToCanvas(n.x, n.y);
    drawNotePin(ctx, pos.x, pos.y, n.label, Math.abs(at - n.tick) <= 3 * TICK_RATE, ui);
  }

  drawFlashOverlay(ctx, data.grenadeEvents, at, size, size, worldToCanvas, false);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export interface ClipOverlay {
  title: string;
  subtitle: string;
  /** Seconds relative to the clip's focus. */
  rel: number;
  /** Bottom-right wordmark. */
  brand: string;
  displayFont: string;
  monoFont: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * Title bar, kill feed and timer burned into an exported clip, so it reads on
 * its own in a chat or a story. Drawn in canvas pixels on top of the frame.
 */
export function drawExportOverlay(
  ctx: CanvasRenderingContext2D,
  size: number,
  overlay: ClipOverlay,
  data: RoundData,
  at: number
) {
  const u = size / 360; // 1 unit = 1 px at 360 px
  const pad = 10 * u;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = "middle";

  // Title bar.
  const barH = 44 * u;
  const grad = ctx.createLinearGradient(0, 0, 0, barH * 1.6);
  grad.addColorStop(0, "rgba(8,7,13,0.92)");
  grad.addColorStop(1, "rgba(8,7,13,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, barH * 1.6);
  ctx.fillStyle = CANVAS_COLORS.accent2;
  ctx.fillRect(pad, pad, 3 * u, barH - 2 * pad + 8 * u);
  ctx.font = `600 ${15 * u}px ${overlay.displayFont}`;
  ctx.fillStyle = CANVAS_COLORS.textPrimary;
  ctx.fillText(fitText(ctx, overlay.title, size - 3 * pad), pad + 9 * u, pad + 7 * u);
  ctx.font = `${10.5 * u}px ${overlay.monoFont}`;
  ctx.fillStyle = CANVAS_COLORS.textTertiary;
  ctx.fillText(fitText(ctx, overlay.subtitle, size - 3 * pad), pad + 9 * u, pad + 22 * u);

  // Kill feed: kills of the last 4 s, newest at the bottom.
  const feed = data.kills.filter((k) => k.tick <= at && at - k.tick <= 4 * TICK_RATE).slice(-4);
  ctx.font = `${10 * u}px ${overlay.monoFont}`;
  let y = barH + 6 * u;
  for (const k of feed) {
    const text = `${k.attackerName} › ${k.victimName}${k.headshot ? " ◎" : ""}`;
    const line = fitText(ctx, text, size * 0.6);
    const w = ctx.measureText(line).width + 12 * u;
    ctx.fillStyle = "rgba(16,14,25,0.82)";
    roundRect(ctx, size - pad - w, y, w, 17 * u, 4 * u);
    ctx.fill();
    ctx.fillStyle = CANVAS_COLORS.textPrimary;
    ctx.fillText(line, size - pad - w + 6 * u, y + 8.5 * u);
    y += 20 * u;
  }

  // Timer (bottom-left) and wordmark (bottom-right).
  ctx.font = `${11 * u}px ${overlay.monoFont}`;
  const time = `${overlay.rel >= 0 ? "+" : "−"}${Math.abs(overlay.rel).toFixed(1)} s`;
  const tw = ctx.measureText(time).width + 12 * u;
  ctx.fillStyle = "rgba(16,14,25,0.82)";
  roundRect(ctx, pad, size - pad - 18 * u, tw, 18 * u, 4 * u);
  ctx.fill();
  ctx.fillStyle = CANVAS_COLORS.textPrimary;
  ctx.fillText(time, pad + 6 * u, size - pad - 9 * u);

  ctx.font = `700 ${11 * u}px ${overlay.displayFont}`;
  ctx.textAlign = "right";
  ctx.fillStyle = CANVAS_COLORS.accent;
  ctx.fillText(overlay.brand, size - pad, size - pad - 9 * u);
  ctx.restore();
}
