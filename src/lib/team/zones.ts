/**
 * Callout zones an admin drew on the radar (MapZone, /callouts): polygons in
 * world units that name a position before the demo's own callouts, so the
 * team analysis can say "Ninja" or "Kitchen" where the game only knows
 * "Bombsite A" or "Shop". Pure module.
 */
import type { Point3 } from "@/lib/analysis/utility";

export interface Zone {
  id: string;
  name: string;
  /** [[x, y], …] world units. */
  points: Array<[number, number]>;
  ctSpot: string;
  laneA: string;
  laneB: string;
}

/** Ray casting: is (x, y) inside the polygon? */
export function insidePolygon(x: number, y: number, pts: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygon area, to prefer the smallest zone when zones overlap (a "Ninja" inside "A site"). */
function area(pts: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

/** A callout lookup that answers with the smallest drawn zone around a position, else `base`. */
export function withZones(zones: Zone[], base: (p: Point3) => string | null): (p: Point3) => string | null {
  if (zones.length === 0) return base;
  const sorted = [...zones].sort((a, b) => area(a.points) - area(b.points));
  return (p) => sorted.find((z) => insidePolygon(p.x, p.y, z.points))?.name ?? base(p);
}

/** Rows from the DB with their JSON points checked. */
export function parseZones(
  rows: Array<{ id: string; name: string; points: unknown; ctSpot: string; laneA: string; laneB: string }>
): Zone[] {
  return rows.flatMap((r) => {
    const pts = Array.isArray(r.points)
      ? (r.points as unknown[]).filter(
          (p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v))
        )
      : [];
    return pts.length >= 3 ? [{ id: r.id, name: r.name, points: pts, ctSpot: r.ctSpot, laneA: r.laneA, laneB: r.laneB }] : [];
  });
}
