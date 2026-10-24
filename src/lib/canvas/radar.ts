import { CANVAS_COLORS } from "./palette";

/** Radar transform subset of `MapConfig` that server pages pass to client viewers. */
export interface RadarConfig {
  posX: number;
  posY: number;
  scale: number;
  width: number;
  height: number;
  radarImage: string;
}

/** Every tool canvas is drawn at this internal resolution and scaled by CSS. */
export const TOOL_CANVAS_SIZE = 1024;

export type WorldToCanvas = (gameX: number, gameY: number) => { x: number; y: number };

/**
 * Game-world → canvas pixel transform. Without a map config it falls back to
 * Mirage's numbers so unknown maps still render something.
 */
export function makeWorldToCanvas(config: RadarConfig | null, size = TOOL_CANVAS_SIZE): WorldToCanvas {
  if (!config) {
    return (gameX, gameY) => ({
      x: ((gameX + 3230) / 5120) * size,
      y: ((1713 - gameY) / 5120) * size,
    });
  }
  return (gameX, gameY) => ({
    x: ((gameX - config.posX) / config.scale) * (size / config.width),
    y: ((config.posY - gameY) / config.scale) * (size / config.height),
  });
}

export type CanvasToWorld = (canvasX: number, canvasY: number) => { x: number; y: number };

/** Inverse of `makeWorldToCanvas`: a canvas pixel back to game-world units (map notes, S16). */
export function makeCanvasToWorld(config: RadarConfig | null, size = TOOL_CANVAS_SIZE): CanvasToWorld {
  if (!config) {
    return (cx, cy) => ({ x: (cx / size) * 5120 - 3230, y: 1713 - (cy / size) * 5120 });
  }
  return (cx, cy) => ({
    x: (cx / (size / config.width)) * config.scale + config.posX,
    y: config.posY - (cy / (size / config.height)) * config.scale,
  });
}

const greyCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

/**
 * The radar desaturated once per image and size. A canvas `filter` runs on
 * every draw, and the replay redraws up to 60 times a second: filtering a
 * 1024 px radar each time made playback stutter.
 */
function greyRadar(radar: HTMLImageElement, width: number, height: number): CanvasImageSource {
  const cached = greyCache.get(radar);
  if (cached && cached.width === width && cached.height === height) return cached;
  if (typeof document === "undefined") return radar;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const g = out.getContext("2d");
  if (!g) return radar;
  g.filter = "grayscale(100%)";
  g.drawImage(radar, 0, 0, width, height);
  greyCache.set(radar, out);
  return out;
}

/** Clears to `--canvas` and draws the radar desaturated, or a grid + map name when it's missing. */
export function drawRadarBackground(
  ctx: CanvasRenderingContext2D,
  radar: HTMLImageElement | null,
  opacity: number,
  mapName: string
) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = CANVAS_COLORS.canvas;
  ctx.fillRect(0, 0, width, height);

  if (radar) {
    ctx.globalAlpha = opacity;
    ctx.drawImage(greyRadar(radar, width, height), 0, 0, width, height);
  } else {
    ctx.strokeStyle = CANVAS_COLORS.grid;
    ctx.lineWidth = 1;
    const step = width / 16;
    for (let i = 1; i < 16; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, height);
      ctx.moveTo(0, i * step);
      ctx.lineTo(width, i * step);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(190, 160, 255, 0.08)";
    ctx.font = `bold ${width * 0.06}px "Chakra Petch", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mapName.toUpperCase(), width / 2, height / 2);
  }
  ctx.restore();
}

/** Centered hint text for an empty canvas. */
export function drawEmptyHint(ctx: CanvasRenderingContext2D, text: string) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = "rgba(243, 240, 255, 0.35)";
  ctx.font = '28px "Geist", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, width / 2, height / 2);
  ctx.restore();
}
