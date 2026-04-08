import type { HeatmapPoint, MapConfig } from "@/types";
import { worldToRadar } from "@/lib/utils/maps";

/**
 * Generate heatmap data from kill/death positions.
 * Uses Gaussian kernel density estimation.
 */
export function generateHeatmap(
  points: Array<{ x: number; y: number }>,
  mapConfig: MapConfig,
  options: {
    resolution?: number; // grid resolution (default 128)
    radius?: number; // influence radius in pixels (default 20)
    intensity?: number; // max intensity multiplier (default 1)
  } = {}
): HeatmapPoint[] {
  const { resolution = 128, radius = 20, intensity = 1 } = options;
  const heatmapPoints: HeatmapPoint[] = [];

  // Convert world coordinates to radar pixel coordinates
  const pixelPoints = points.map((p) => worldToRadar(mapConfig, p.x, p.y));

  // Create density grid
  const cellSize = mapConfig.width / resolution;

  for (let gx = 0; gx < resolution; gx++) {
    for (let gy = 0; gy < resolution; gy++) {
      const cx = (gx + 0.5) * cellSize;
      const cy = (gy + 0.5) * cellSize;

      let density = 0;
      for (const p of pixelPoints) {
        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < radius) {
          // Gaussian kernel
          density += Math.exp((-dist * dist) / (2 * (radius / 3) ** 2));
        }
      }

      if (density > 0.01) {
        heatmapPoints.push({
          x: cx,
          y: cy,
          intensity: Math.min(density * intensity, 1),
        });
      }
    }
  }

  return heatmapPoints;
}

/**
 * Render heatmap onto a Canvas context.
 */
export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  width: number,
  height: number
) {
  // Create offscreen canvas for compositing
  const offscreen = new OffscreenCanvas(width, height);
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) return;

  // Draw each point as a radial gradient
  for (const point of points) {
    const radius = 20;
    const gradient = offCtx.createRadialGradient(
      point.x,
      point.y,
      0,
      point.x,
      point.y,
      radius
    );

    gradient.addColorStop(0, `rgba(239, 68, 68, ${point.intensity})`);
    gradient.addColorStop(0.4, `rgba(251, 191, 36, ${point.intensity * 0.6})`);
    gradient.addColorStop(0.7, `rgba(59, 130, 246, ${point.intensity * 0.3})`);
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");

    offCtx.fillStyle = gradient;
    offCtx.fillRect(
      point.x - radius,
      point.y - radius,
      radius * 2,
      radius * 2
    );
  }

  // Apply Gaussian blur for smoothness
  ctx.filter = "blur(8px)";
  ctx.globalAlpha = 0.7;
  ctx.drawImage(offscreen, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
}

/**
 * Calculate HLTV 2.1 rating from round-level data.
 * Simplified approximation — actual formula is proprietary.
 */
export function calculateHLTVRating(stats: {
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  kast: number; // % of rounds with Kill/Assist/Survived/Traded
  rounds: number;
}): number {
  const { kills, deaths, assists, adr, kast, rounds } = stats;
  if (rounds === 0) return 0;

  const kpr = kills / rounds;
  const dpr = deaths / rounds;
  const impact = 2.13 * kpr + 0.42 * (assists / rounds) - 0.41;

  // HLTV 2.1 approximation
  const rating =
    0.0073 * kast +
    0.3591 * kpr +
    -0.5329 * dpr +
    0.2372 * impact +
    0.0032 * adr +
    0.1587;

  return Math.max(0, Math.round(rating * 100) / 100);
}
