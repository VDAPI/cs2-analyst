/**
 * Callout names for map positions (S11), learned from demos: the parser reads
 * every player's `last_place_name` (the game's own nav-mesh callouts, e.g.
 * "TopofMid", "BombsiteA") once per second, and each sample is counted on a
 * 128-unit grid per map (MapPlaceCell). Any position — a smoke landing, a
 * lineup's throw spot — gets the most common name around it.
 *
 * Pure module (lookup + aggregation), covered by `npm run test:utility`.
 */
import type { Point3 } from "./utility";

export const PLACE_CELL = 128;

export interface PlaceCell {
  cx: number;
  cy: number;
  cz: number;
  place: string;
  count: number;
}

export interface PlaceSample {
  x: number;
  y: number;
  z: number;
  place: string;
}

const cell = (v: number) => Math.floor(v / PLACE_CELL);

/** Sum samples into grid cells (one row per cell and name). */
export function aggregatePlaces(samples: PlaceSample[]): PlaceCell[] {
  const acc = new Map<string, PlaceCell>();
  for (const s of samples) {
    const place = s.place.trim();
    if (!place || !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.z)) continue;
    const c = { cx: cell(s.x), cy: cell(s.y), cz: cell(s.z) };
    const key = `${c.cx}|${c.cy}|${c.cz}|${place}`;
    const row = acc.get(key);
    if (row) row.count++;
    else acc.set(key, { ...c, place, count: 1 });
  }
  return [...acc.values()];
}

/** "TopofMid" → "Top of Mid", "BombsiteA" → "Bombsite A", "CTSpawn" → "CT Spawn". */
export function humanizePlace(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/([a-z])of ([A-Z])/g, "$1 of $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lookup over a map's cells: the name with the most samples in the position's
 * cell, else in the 3×3×3 cells around it (nearer cells weigh more).
 */
export function placeLookup(cells: PlaceCell[]): (p: Point3) => string | null {
  const byCell = new Map<string, PlaceCell[]>();
  for (const c of cells) {
    const key = `${c.cx}|${c.cy}|${c.cz}`;
    const list = byCell.get(key) ?? [];
    list.push(c);
    byCell.set(key, list);
  }
  return (p) => {
    if (byCell.size === 0) return null;
    const cx = cell(p.x), cy = cell(p.y), cz = cell(p.z);
    const own = byCell.get(`${cx}|${cy}|${cz}`);
    const score = new Map<string, number>();
    if (own) for (const c of own) score.set(c.place, (score.get(c.place) ?? 0) + c.count * 4);
    if (score.size === 0) {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            for (const c of byCell.get(`${cx + dx}|${cy + dy}|${cz + dz}`) ?? []) {
              const w = 1 / (1 + Math.abs(dx) + Math.abs(dy) + Math.abs(dz));
              score.set(c.place, (score.get(c.place) ?? 0) + c.count * w);
            }
          }
    }
    let best: string | null = null;
    let bestScore = 0;
    for (const [place, s] of score) {
      if (s > bestScore) {
        best = place;
        bestScore = s;
      }
    }
    return best ? humanizePlace(best) : null;
  };
}
