/**
 * Bombsites and map zones (S31): where a position is on the map in the terms
 * a team talks about it — bombsite A, bombsite B or mid (everything between).
 *
 * Site centres come from the game's own callouts (MapPlaceCell cells named
 * "BombsiteA" / "BombsiteB", learned from every demo of the map) and, as a
 * fallback, from this match's plants (BombEvent.site). A position is on a
 * site's side of the map when its callout names the site, or when it is
 * clearly nearer that site than the other one and within SITE_ZONE_RANGE.
 *
 * Pure module, covered by `npm run test:roles` and `npm run test:tactics`.
 */
import { PLACE_CELL, type PlaceCell } from "./places";

export type Zone = "A" | "B" | "mid";
export type SiteLetter = "A" | "B";

interface Vec {
  x: number;
  y: number;
  z: number;
}

export type SiteCentres = Partial<Record<SiteLetter, Vec>>;

/** A position this close to a site centre (and clearly nearer it than the other) is on that site's side. */
export const SITE_ZONE_RANGE = 1400;
/** "Clearly nearer": distance to the near site at most this share of the distance to the far one. */
export const SITE_ZONE_RATIO = 0.75;

const dist2d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** "BombsiteA", "Bombsite A", "Bombsite a" → "A"; anything else → null. */
export function siteOfPlace(place: string | null | undefined): SiteLetter | null {
  const m = /bombsite\s*([ab])\b/i.exec(place ?? "");
  return m ? (m[1].toUpperCase() as SiteLetter) : null;
}

/** Sample-weighted centre of the cells named after each bombsite. */
export function siteCentresFromCells(cells: Pick<PlaceCell, "cx" | "cy" | "cz" | "place" | "count">[]): SiteCentres {
  const acc: Partial<Record<SiteLetter, { x: number; y: number; z: number; n: number }>> = {};
  for (const c of cells) {
    const site = siteOfPlace(c.place);
    if (!site || c.count <= 0) continue;
    const a = (acc[site] ??= { x: 0, y: 0, z: 0, n: 0 });
    a.x += (c.cx + 0.5) * PLACE_CELL * c.count;
    a.y += (c.cy + 0.5) * PLACE_CELL * c.count;
    a.z += (c.cz + 0.5) * PLACE_CELL * c.count;
    a.n += c.count;
  }
  const out: SiteCentres = {};
  for (const site of ["A", "B"] as const) {
    const a = acc[site];
    if (a && a.n > 0) out[site] = { x: a.x / a.n, y: a.y / a.n, z: a.z / a.n };
  }
  return out;
}

/** Average plant position per site letter (plants without a letter are skipped). */
export function siteCentresFromPlants(
  bombs: Array<{ type: string; site: string | null; posX: number; posY: number; posZ: number }>
): SiteCentres {
  const acc: Partial<Record<SiteLetter, { x: number; y: number; z: number; n: number }>> = {};
  for (const b of bombs) {
    if (b.type !== "PLANTED") continue;
    const site = b.site === "A" || b.site === "B" ? b.site : null;
    if (!site) continue;
    const a = (acc[site] ??= { x: 0, y: 0, z: 0, n: 0 });
    a.x += b.posX;
    a.y += b.posY;
    a.z += b.posZ;
    a.n++;
  }
  const out: SiteCentres = {};
  for (const site of ["A", "B"] as const) {
    const a = acc[site];
    if (a) out[site] = { x: a.x / a.n, y: a.y / a.n, z: a.z / a.n };
  }
  return out;
}

/** The first source that knows a site wins (callouts before plants). */
export function mergeSites(...sources: Array<SiteCentres | null | undefined>): SiteCentres {
  const out: SiteCentres = {};
  for (const s of sources) {
    if (!s) continue;
    for (const site of ["A", "B"] as const) if (!out[site] && s[site]) out[site] = s[site];
  }
  return out;
}

/**
 * Zone of a position: the site its callout names, else the clearly nearer
 * site within range, else mid. Null when the map's sites are unknown (with
 * one known site, only "on that site" can be told apart).
 */
export function zoneOf(p: Vec, place: string | null | undefined, sites: SiteCentres): Zone | null {
  const named = siteOfPlace(place);
  if (named) return named;
  const { A, B } = sites;
  if (A && B) {
    const dA = dist2d(p, A);
    const dB = dist2d(p, B);
    const [near, dNear, dFar] = dA <= dB ? (["A", dA, dB] as const) : (["B", dB, dA] as const);
    return dNear <= SITE_ZONE_RANGE && dNear <= SITE_ZONE_RATIO * dFar ? near : "mid";
  }
  const only = A ? (["A", A] as const) : B ? (["B", B] as const) : null;
  if (only && dist2d(p, only[1]) <= SITE_ZONE_RANGE) return only[0];
  return null;
}

/** Distance (2D) from a position to a site's centre, or null when the site is unknown. */
export function distToSite(p: Vec, site: SiteLetter, sites: SiteCentres): number | null {
  const c = sites[site];
  return c ? dist2d(p, c) : null;
}
