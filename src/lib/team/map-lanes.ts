/**
 * How players name a map, on top of the demo's callouts (Valve place names,
 * humanized by src/lib/analysis/places.ts): short names ("Window", "Con"),
 * the CT positions a team splits the map into, and the lanes Ts take into
 * each bombsite. The team breakdown uses them to say "Split A: 3 Con,
 * 2 Ramp" and "B: x · Short: y · Window: z · Con: v · A: w".
 *
 * Maps without a table keep the raw callouts (still readable, just longer).
 */

export type CtSpot = string;
export type Site = "A" | "B";

export interface MapLanes {
  /** Display name per normalized callout (see `placeKey`). */
  names: Record<string, string>;
  /** CT positions in the order a team lists them, and the callouts each covers. */
  ctSpots: Array<{ name: CtSpot; places: string[] }>;
  /** T lanes into each site; a player's lane is the last one passed before the site. */
  lanes: Record<Site, Array<{ name: string; places: string[] }>>;
}

/** "Palace Interior" → "palaceinterior", "Top of Mid" → "topofmid". */
export const placeKey = (place: string) => place.toLowerCase().replace(/[^a-z0-9]/g, "");

const MIRAGE: MapLanes = {
  names: {
    ctspawn: "CT Spawn",
    tspawn: "T Spawn",
    bombsitea: "A",
    bombsiteb: "B",
    middle: "Mid",
    topofmid: "Top Mid",
    catwalk: "Short",
    snipersnest: "Window",
    ladder: "Ladder",
    connector: "Con",
    jungle: "Jungle",
    stairs: "Stairs",
    scaffolding: "Scaffold",
    tramp: "Rampa A",
    palace: "Palace",
    palaceinterior: "Palace",
    palacealley: "Rampa A",
    apartments: "B Apps",
    bapartments: "B Apps",
    house: "Apps (T)",
    sidealley: "Alley",
    backalley: "Alley",
    underpass: "Underpass",
    shop: "Market",
    market: "Market",
    truck: "B (Van)",
  },
  ctSpots: [
    { name: "B", places: ["bombsiteb", "shop", "market", "truck", "apartments", "bapartments"] },
    { name: "Short", places: ["catwalk", "underpass"] },
    { name: "Window", places: ["snipersnest", "ladder", "middle"] },
    { name: "Con", places: ["connector", "jungle"] },
    { name: "A", places: ["bombsitea", "stairs", "scaffolding", "ctspawn"] },
  ],
  lanes: {
    A: [
      { name: "Rampa", places: ["tramp", "palacealley", "scaffolding"] },
      { name: "Palace", places: ["palace", "palaceinterior"] },
      { name: "Con", places: ["connector", "jungle", "stairs"] },
      { name: "Mid", places: ["middle", "topofmid", "snipersnest", "ladder"] },
    ],
    B: [
      { name: "B Apps", places: ["apartments", "bapartments"] },
      { name: "Short", places: ["catwalk"] },
      { name: "Underpass", places: ["underpass"] },
      { name: "Mid", places: ["middle", "topofmid"] },
      { name: "Market", places: ["shop", "market"] },
    ],
  },
};

const MAPS: Record<string, MapLanes> = { de_mirage: MIRAGE };

export const mapLanes = (map: string): MapLanes | null => MAPS[map] ?? null;

/** The players' name for a callout on this map (the callout itself when unknown). */
export function shortPlace(map: string, place: string): string {
  return mapLanes(map)?.names[placeKey(place)] ?? place;
}

/** CT position a callout belongs to; null = off the usual positions (aggression, rotation). */
export function ctSpotOf(map: string, place: string): CtSpot | null {
  const key = placeKey(place);
  return mapLanes(map)?.ctSpots.find((s) => s.places.includes(key))?.name ?? null;
}

/**
 * The lane a T took into `site`: the first lane callout after leaving spawn
 * (the callout grid mislabels some cells next to a lane, e.g. Palace above
 * the top of Mirage's ramp, so the first lane is the one actually walked).
 * Mid only counts when the route never went further (Mid → Con is Con).
 * Null when none of the route belongs to that site's lanes.
 */
export function laneOf(map: string, site: Site, path: string[]): string | null {
  const lanes = mapLanes(map)?.lanes[site];
  if (!lanes) {
    // No table: the last callout before the site is the lane.
    const before = path.filter((p) => !/bombsite/i.test(p));
    return before[before.length - 1] ?? null;
  }
  const fromSpawn = path.slice(path.map(placeKey).lastIndexOf("tspawn") + 1);
  let mid: string | null = null;
  for (const place of fromSpawn) {
    const lane = lanes.find((l) => l.places.includes(placeKey(place)));
    if (!lane) continue;
    if (lane.name !== "Mid") return lane.name;
    mid ??= lane.name;
  }
  return mid;
}
