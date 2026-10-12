/**
 * Kill/death density layer (DESIGN.md §7 Heatmaps):
 * transparent → violet(0.25) → lime(0.45) → warning(0.6) → mistake(0.8),
 * Gaussian blobs + blur(6px). Static, never animated.
 */
interface GradientStop {
  t: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

// Single source of truth for the colorizer and the legend swatch.
export const HEATMAP_STOPS: GradientStop[] = [
  { t: 0, r: 155, g: 107, b: 255, a: 0 },
  { t: 0.25, r: 155, g: 107, b: 255, a: 0.25 },
  { t: 0.5, r: 198, g: 255, b: 61, a: 0.45 },
  { t: 0.75, r: 255, g: 176, b: 32, a: 0.6 },
  { t: 1, r: 255, g: 77, b: 106, a: 0.8 },
];

// On the dark legend backdrop the transparent first stop reads as a gap, so
// the legend drops it and lifts the rest a little.
export const HEATMAP_LEGEND_GRADIENT = `linear-gradient(to right, ${HEATMAP_STOPS.slice(1)
  .map((s) => `rgba(${s.r},${s.g},${s.b},${Math.round((s.a + 0.1) * 100) / 100})`)
  .join(", ")})`;

function interpolate(t: number) {
  let lower = HEATMAP_STOPS[0];
  let upper = HEATMAP_STOPS[HEATMAP_STOPS.length - 1];
  for (let i = 0; i < HEATMAP_STOPS.length - 1; i++) {
    if (t >= HEATMAP_STOPS[i].t && t <= HEATMAP_STOPS[i + 1].t) {
      lower = HEATMAP_STOPS[i];
      upper = HEATMAP_STOPS[i + 1];
      break;
    }
  }
  const range = upper.t - lower.t;
  const f = range === 0 ? 0 : (t - lower.t) / range;
  return {
    r: Math.round(lower.r + (upper.r - lower.r) * f),
    g: Math.round(lower.g + (upper.g - lower.g) * f),
    b: Math.round(lower.b + (upper.b - lower.b) * f),
    a: lower.a + (upper.a - lower.a) * f,
  };
}

export function drawHeatmapLayer(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  radius = 35
) {
  const { width, height } = ctx.canvas;
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const offCtx = off.getContext("2d", { willReadFrequently: true });
  if (!offCtx) return;

  for (const p of points) {
    const g = offCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    g.addColorStop(0, "rgba(255, 255, 255, 0.4)");
    g.addColorStop(0.5, "rgba(255, 255, 255, 0.15)");
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    offCtx.fillStyle = g;
    offCtx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
  }

  const image = offCtx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const c = interpolate(Math.min(alpha / 180, 1));
    data[i] = c.r;
    data[i + 1] = c.g;
    data[i + 2] = c.b;
    data[i + 3] = Math.round(c.a * 255);
  }
  offCtx.putImageData(image, 0, 0);

  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}
