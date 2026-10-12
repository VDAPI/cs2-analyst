/**
 * 2D replay drawing (DESIGN.md §7). Pure canvas helpers used by the replay
 * viewer; colors mirror the Violet Lime tokens via CANVAS_COLORS.
 */
import type { PlayerSnapshot, ReplayGrenadeEvent, ReplayBombEvent } from "@/stores/replay-store";
import { TICK_RATE } from "@/stores/replay-store";
import { CANVAS_COLORS, grenadeStyle, healthColor } from "./palette";
import type { WorldToCanvas } from "./radar";

export const PLAYER_RADIUS = 12;
const CT_COLOR_DEAD = "rgba(90, 169, 255, 0.35)";
const T_COLOR_DEAD = "rgba(255, 194, 61, 0.35)";

// ─── Players ────────────────────────────────────────────

export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  player: PlayerSnapshot,
  showName: boolean,
  selected: boolean,
  tick: number,
  /** Marker size factor from useCanvasUiScale. */
  ui = 1
) {
  const isCT = player.team === "CT";

  if (!player.isAlive) {
    ctx.save();
    ctx.strokeStyle = selected ? CANVAS_COLORS.accent : isCT ? CT_COLOR_DEAD : T_COLOR_DEAD;
    ctx.lineWidth = (selected ? 3 : 2) * ui;
    const s = 8 * ui;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const color = isCT ? CANVAS_COLORS.ct : CANVAS_COLORS.t;
  const radius = (selected ? PLAYER_RADIUS + 2 : PLAYER_RADIUS) * ui;

  ctx.save();

  // Selected: pulsing violet glow ring
  if (selected) {
    const pulse = 1 + Math.sin(tick * 0.12) * 0.15;
    ctx.beginPath();
    ctx.arc(x, y, (radius + 7 * ui) * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = CANVAS_COLORS.accent;
    ctx.lineWidth = 3 * ui;
    ctx.shadowColor = CANVAS_COLORS.accent;
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // View direction
  const angleRad = (player.yaw * Math.PI) / 180;
  const dirLen = radius * 2.1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angleRad) * dirLen, y - Math.sin(angleRad) * dirLen);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * ui;
  ctx.lineCap = "round";
  ctx.stroke();

  // Body: team fill + 1px light outline
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = CANVAS_COLORS.textPrimary;
  ctx.lineWidth = (selected ? 2 : 1) * ui;
  ctx.stroke();

  // Health bar
  if (player.health < 100) {
    const barWidth = radius * 2.2;
    const barY = y + radius + 5 * ui;
    const barH = 4 * ui;
    ctx.fillStyle = "rgba(8, 7, 13, 0.75)";
    ctx.fillRect(x - barWidth / 2, barY, barWidth, barH);
    ctx.fillStyle = healthColor(player.health);
    ctx.fillRect(x - barWidth / 2, barY, barWidth * (player.health / 100), barH);
  }

  // Name: Geist Mono, light with dark outline
  if (showName || selected) {
    const nameY = y - radius - 6 * ui;
    ctx.font = `${selected ? "bold " : ""}${Math.round((selected ? 15 : 13) * ui)}px "Geist Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.strokeStyle = "rgba(8, 7, 13, 0.9)";
    ctx.lineWidth = 4 * ui;
    ctx.lineJoin = "round";
    ctx.strokeText(player.name, x, nameY);
    ctx.fillStyle = CANVAS_COLORS.textPrimary;
    ctx.fillText(player.name, x, nameY);
  }

  ctx.restore();
}

export function drawKillMarker(ctx: CanvasRenderingContext2D, x: number, y: number, fresh: boolean, ui = 1) {
  const s = 8 * ui;
  ctx.save();
  ctx.strokeStyle = CANVAS_COLORS.mistake;
  ctx.lineWidth = 2.5 * ui;
  ctx.globalAlpha = fresh ? 1 : 0.55;
  if (fresh) {
    // Kill flash glow for the first moments after the kill
    ctx.shadowColor = "rgba(255, 77, 106, 0.8)";
    ctx.shadowBlur = 18;
  }
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.restore();
}

// ─── Grenade drawing helpers ──────────────────────────────

// Smoke covers ~144 game units. On de_mirage (scale=5), that's 144/5 ≈ 29 radar pixels.
// The tool canvas is 1024px for a 1024px radar, so radar pixels = canvas pixels.
// Use ~30 canvas pixels as base, but scale slightly larger for visual clarity.
const SMOKE_RADIUS = 34;
const MOLOTOV_RADIUS = 26;
const HE_MAX_RADIUS = 30;

function grenadeDurationTicks(g: ReplayGrenadeEvent): number {
  if (g.type === "SMOKE") return ((g.duration ?? 18000) / 1000) * TICK_RATE;
  if (g.type === "MOLOTOV" || g.type === "INCENDIARY") return ((g.duration ?? 7000) / 1000) * TICK_RATE;
  return 0;
}

export function drawActiveSmokes(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: WorldToCanvas
) {
  for (const g of grenades) {
    if (g.type !== "SMOKE") continue;
    const dur = grenadeDurationTicks(g);
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= dur) continue;

    const pos = worldToCanvas(g.landX, g.landY);

    // Fade envelope
    const fadeIn = 64;
    const fadeOut = 128;
    let fade = 1;
    if (elapsed < fadeIn) fade = elapsed / fadeIn;
    else if (elapsed > dur - fadeOut) fade = (dur - elapsed) / fadeOut;

    // Subtle pulse animation
    const pulse = 1 + Math.sin(currentTick * 0.04) * 0.04;
    const radius = SMOKE_RADIUS * pulse;

    ctx.save();

    // Outer smoke body — solid fill with soft edge
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
    grad.addColorStop(0, `rgba(205, 200, 228, ${0.75 * fade})`);
    grad.addColorStop(0.5, `rgba(169, 163, 196, ${0.65 * fade})`);
    grad.addColorStop(0.8, `rgba(169, 163, 196, ${0.4 * fade})`);
    grad.addColorStop(1, `rgba(169, 163, 196, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // White center glow
    const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 0.4);
    glow.addColorStop(0, `rgba(255, 255, 255, ${0.35 * fade})`);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Crisp border ring
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.85, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(169, 163, 196, ${0.35 * fade})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }
}

export function drawActiveFires(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: WorldToCanvas
) {
  for (const g of grenades) {
    if (g.type !== "MOLOTOV" && g.type !== "INCENDIARY") continue;
    const dur = grenadeDurationTicks(g);
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= dur) continue;

    const pos = worldToCanvas(g.landX, g.landY);

    // Fade envelope
    const fadeIn = 32;
    const fadeOut = 64;
    let fade = 1;
    if (elapsed < fadeIn) fade = elapsed / fadeIn;
    else if (elapsed > dur - fadeOut) fade = (dur - elapsed) / fadeOut;

    // Flicker animation — oscillate radius and alpha
    const flicker1 = Math.sin(currentTick * 0.5) * 0.08;
    const flicker2 = Math.sin(currentTick * 0.23 + 1.7) * 0.06;
    const alpha = (0.5 + flicker1 + flicker2) * fade;
    const radius = MOLOTOV_RADIUS * (1 + Math.sin(currentTick * 0.35) * 0.06);

    ctx.save();

    // Fire body — bright orange core with red outer
    const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius);
    grad.addColorStop(0, `rgba(255, 160, 30, ${alpha * 1.1})`);
    grad.addColorStop(0.4, `rgba(249, 115, 22, ${alpha})`);
    grad.addColorStop(0.75, `rgba(220, 70, 10, ${alpha * 0.6})`);
    grad.addColorStop(1, `rgba(180, 40, 0, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Bright center hotspot
    const hot = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 0.3);
    hot.addColorStop(0, `rgba(255, 230, 100, ${0.35 * fade})`);
    hot.addColorStop(1, "rgba(255, 200, 50, 0)");
    ctx.fillStyle = hot;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export function drawHEExplosions(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: WorldToCanvas
) {
  const heDuration = 32; // ~500ms
  for (const g of grenades) {
    if (g.type !== "HE") continue;
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= heDuration) continue;

    const pos = worldToCanvas(g.landX, g.landY);
    const progress = elapsed / heDuration;
    const radius = 6 + progress * (HE_MAX_RADIUS - 6);
    const alpha = (1 - progress);

    ctx.save();

    // Outer red blast ring
    const grad = ctx.createRadialGradient(pos.x, pos.y, radius * 0.3, pos.x, pos.y, radius);
    grad.addColorStop(0, `rgba(255, 100, 50, ${0.6 * alpha})`);
    grad.addColorStop(0.6, `rgba(239, 68, 68, ${0.5 * alpha})`);
    grad.addColorStop(1, `rgba(200, 30, 30, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Bright white-yellow core (first half of explosion)
    if (progress < 0.5) {
      const coreAlpha = (1 - progress * 2);
      const core = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius * 0.4);
      core.addColorStop(0, `rgba(255, 255, 200, ${0.7 * coreAlpha})`);
      core.addColorStop(1, "rgba(255, 180, 50, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Expanding ring outline
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 * alpha})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }
}

export function drawFlashOverlay(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  width: number,
  height: number,
  worldToCanvas: WorldToCanvas,
  /** Whole-map white-out; off under prefers-reduced-motion. */
  fullScreen = true
) {
  // One replay frame is 32 ticks, so a shorter window could skip the pop entirely.
  const flashDuration = 32;
  for (const g of grenades) {
    if (g.type !== "FLASH") continue;
    const elapsed = currentTick - g.tick;
    if (elapsed < 0 || elapsed >= flashDuration) continue;

    const progress = elapsed / flashDuration;
    // Sharp peak then quick decay
    const alpha = progress < 0.15 ? (progress / 0.15) * 0.7 : 0.7 * (1 - (progress - 0.15) / 0.85);

    ctx.save();

    if (fullScreen) {
      ctx.fillStyle = `rgba(243, 240, 255, ${alpha * 0.35})`;
      ctx.fillRect(0, 0, width, height);
    }

    // Bright burst circle at detonation point
    const pos = worldToCanvas(g.landX, g.landY);
    const burstRadius = 25 + progress * 15;
    const burstGrad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, burstRadius);
    burstGrad.addColorStop(0, `rgba(255, 255, 255, ${0.7 * (1 - progress)})`);
    burstGrad.addColorStop(0.5, `rgba(253, 224, 71, ${0.3 * (1 - progress)})`);
    burstGrad.addColorStop(1, "rgba(253, 224, 71, 0)");
    ctx.fillStyle = burstGrad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, burstRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

export function drawGrenadeTrajectories(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: WorldToCanvas
) {
  const flightTicks = 64;
  for (const g of grenades) {
    const timeToDetonate = g.tick - currentTick;
    if (timeToDetonate <= 0 || timeToDetonate > flightTicks) continue;

    const throwPos = worldToCanvas(g.throwX, g.throwY);
    const landPos = worldToCanvas(g.landX, g.landY);
    const color = grenadeStyle(g.type).line;
    const alpha = 1 - timeToDetonate / flightTicks;

    ctx.save();

    // Thick dashed trajectory line
    ctx.globalAlpha = Math.max(0.3, alpha * 0.85);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.moveTo(throwPos.x, throwPos.y);
    ctx.lineTo(landPos.x, landPos.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Interpolated grenade position
    const t = 1 - timeToDetonate / flightTicks;
    const gx = throwPos.x + (landPos.x - throwPos.x) * t;
    const gy = throwPos.y + (landPos.y - throwPos.y) * t;

    // Grenade icon — filled circle with outline and inner dot
    ctx.globalAlpha = Math.max(0.5, alpha);
    ctx.beginPath();
    ctx.arc(gx, gy, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // White center dot
    ctx.beginPath();
    ctx.arc(gx, gy, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fill();

    ctx.restore();
  }
}

const BOMB_TIMER_S = 40;

/** Planted bomb that is still ticking at `currentTick`, with seconds left. */
export function activeBomb(
  bombEvents: ReplayBombEvent[],
  currentTick: number
): { event: ReplayBombEvent; remaining: number } | null {
  let planted: ReplayBombEvent | null = null;
  let resolved: ReplayBombEvent | null = null;
  for (const b of bombEvents) {
    if (b.type === "PLANTED" && b.tick <= currentTick) {
      planted = b;
      resolved = null;
    } else if (planted && (b.type === "DEFUSED" || b.type === "EXPLODED")) {
      resolved = b;
    }
  }
  if (!planted) return null;
  if (resolved && resolved.tick <= currentTick) return null;
  const remaining = Math.max(0, BOMB_TIMER_S - (currentTick - planted.tick) / TICK_RATE);
  return { event: planted, remaining };
}

export function drawBombMarker(
  ctx: CanvasRenderingContext2D,
  bombEvents: ReplayBombEvent[],
  currentTick: number,
  worldToCanvas: WorldToCanvas,
  ui = 1
) {
  const bomb = activeBomb(bombEvents, currentTick);
  if (!bomb) return;
  const pos = worldToCanvas(bomb.event.x, bomb.event.y);
  const { width, height } = ctx.canvas;

  ctx.save();

  // Pulsing --t-gold ring
  const pulseRadius = (18 + Math.sin(currentTick * 0.08) * 6) * ui;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, pulseRadius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 194, 61, 0.5)";
  ctx.lineWidth = 2 * ui;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 9 * ui, 0, Math.PI * 2);
  ctx.fillStyle = CANVAS_COLORS.t;
  ctx.fill();

  if (bomb.event.site) {
    ctx.font = `bold ${Math.round(13 * ui)}px "Geist Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = CANVAS_COLORS.canvas;
    ctx.fillText(bomb.event.site, pos.x, pos.y + 1);
  }

  // Timer bar along the bottom edge: t-gold → mistake as it runs out
  const left = bomb.remaining / BOMB_TIMER_S;
  const barHeight = 6 * ui;
  ctx.fillStyle = "rgba(8, 7, 13, 0.6)";
  ctx.fillRect(0, height - barHeight, width, barHeight);
  const g = Math.round(77 + (194 - 77) * left);
  const b = Math.round(106 + (61 - 106) * left);
  ctx.fillStyle = `rgb(255, ${g}, ${b})`;
  ctx.fillRect(0, height - barHeight, width * left, barHeight);

  ctx.restore();
}

// ─── S10: view cone, utility timers, mistake markers ────

/** CS2's horizontal field of view on a 16:9 screen (fov 90 on 4:3) is ~106°. */
export const VIEW_HALF_ANGLE_DEG = 53;
/** How far the drawn view cone reaches, in game units. */
export const VIEW_CONE_UNITS = 1400;

/**
 * Field-of-view cone in front of a player. `lengthPx` is VIEW_CONE_UNITS in
 * canvas pixels (from the radar scale), so the cone means the same on every map.
 */
export function drawViewCone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  yaw: number,
  team: "CT" | "T",
  lengthPx: number,
  strong: boolean
) {
  const color = team === "CT" ? "90, 169, 255" : "255, 194, 61";
  const a = (-yaw * Math.PI) / 180; // canvas y grows down
  const half = (VIEW_HALF_ANGLE_DEG * Math.PI) / 180;
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, lengthPx);
  grad.addColorStop(0, `rgba(${color}, ${strong ? 0.28 : 0.12})`);
  grad.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, lengthPx, a - half, a + half);
  ctx.closePath();
  ctx.fill();
  if (strong) {
    ctx.strokeStyle = `rgba(${color}, 0.45)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a - half) * lengthPx, y + Math.sin(a - half) * lengthPx);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a + half) * lengthPx, y + Math.sin(a + half) * lengthPx);
    ctx.stroke();
  }
  ctx.restore();
}

/** Seconds left on smokes and fires, as a ring and a number next to the cloud. */
export function drawUtilityTimers(
  ctx: CanvasRenderingContext2D,
  grenades: ReplayGrenadeEvent[],
  currentTick: number,
  worldToCanvas: WorldToCanvas,
  ui = 1
) {
  for (const g of grenades) {
    if (g.type !== "SMOKE" && g.type !== "MOLOTOV" && g.type !== "INCENDIARY") continue;
    const dur = grenadeDurationTicks(g);
    const elapsed = currentTick - g.tick;
    if (dur <= 0 || elapsed < 0 || elapsed >= dur) continue;
    const left = 1 - elapsed / dur;
    const seconds = Math.ceil((dur - elapsed) / TICK_RATE);
    const pos = worldToCanvas(g.landX, g.landY);
    const r = (g.type === "SMOKE" ? SMOKE_RADIUS : MOLOTOV_RADIUS) + 4;
    const color = g.type === "SMOKE" ? "rgba(243, 240, 255, 0.85)" : "rgba(255, 122, 51, 0.95)";

    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * ui;
    ctx.lineCap = "round";
    ctx.stroke();

    const label = `${seconds}`;
    ctx.font = `bold ${Math.round(12 * ui)}px "Geist Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lx = pos.x + r * 0.75;
    const ly = pos.y - r * 0.75;
    const w = ctx.measureText(label).width + 8 * ui;
    const h = 16 * ui;
    ctx.fillStyle = "rgba(8, 7, 13, 0.8)";
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, ly - h / 2, w, h, 4 * ui);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(label, lx, ly + 0.5);
    ctx.restore();
  }
}

/** Weapon and HP under a player (the selected one), so the clip reads without the side list. */
export function drawPlayerLoadout(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  player: Pick<PlayerSnapshot, "weapon" | "health" | "isAlive">,
  ui = 1
) {
  if (!player.isAlive) return;
  const weapon = player.weapon.replace(/^weapon_/, "");
  const label = weapon ? `${weapon} · ${player.health} HP` : `${player.health} HP`;
  ctx.save();
  ctx.font = `${Math.round(12 * ui)}px "Geist Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const ly = y + (PLAYER_RADIUS + 13) * ui;
  ctx.strokeStyle = "rgba(8, 7, 13, 0.9)";
  ctx.lineWidth = 4 * ui;
  ctx.lineJoin = "round";
  ctx.strokeText(label, x, ly);
  ctx.fillStyle = healthColor(player.health);
  ctx.fillText(label, x, ly);
  ctx.restore();
}

/** Dashed line from the player to the enemy the mistake was against. */
export function drawSightLine(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ui = 1
) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 77, 106, 0.7)";
  ctx.lineWidth = 2 * ui;
  ctx.setLineDash([6 * ui, 5 * ui]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Mistake marker on a player: a pulsing ring in the severity color with a "!"
 * badge. `strength` (0–1) fades it in and out around the mistake's tick.
 */
export function drawFindingMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  severity: "high" | "medium" | "low",
  tick: number,
  strength: number,
  ui = 1
) {
  if (strength <= 0) return;
  const color = severity === "high" ? CANVAS_COLORS.mistake : severity === "medium" ? CANVAS_COLORS.warning : CANVAS_COLORS.accent;
  const pulse = 1 + Math.sin(tick * 0.25) * 0.12;
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength);
  ctx.beginPath();
  ctx.arc(x, y, (PLAYER_RADIUS + 12) * ui * pulse, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * ui;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const bx = x + (PLAYER_RADIUS + 10) * ui;
  const by = y - (PLAYER_RADIUS + 10) * ui;
  const br = 9 * ui;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = CANVAS_COLORS.canvas;
  ctx.font = `bold ${Math.round(13 * ui)}px "Geist Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", bx, by + 0.5);
  ctx.restore();
}

/**
 * Map note pin (S16): a lime map pin whose tip sits on the noted spot, with
 * its number. `active` (the note's moment is near) draws it full strength
 * with a glow; other notes of the round stay dimmed.
 */
export function drawNotePin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  active: boolean,
  ui = 1
) {
  const r = 11 * ui;
  const cy = y - r * 1.9;
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, cy, r, Math.PI * 0.75, Math.PI * 0.25);
  ctx.closePath();
  ctx.fillStyle = CANVAS_COLORS.accent2;
  if (active) {
    ctx.shadowColor = CANVAS_COLORS.accent2;
    ctx.shadowBlur = 16;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2 * ui;
  ctx.strokeStyle = CANVAS_COLORS.canvas;
  ctx.stroke();
  ctx.fillStyle = CANVAS_COLORS.canvas;
  ctx.font = `bold ${Math.round(12 * ui)}px "Geist Mono", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, cy + 0.5);
  ctx.restore();
}
