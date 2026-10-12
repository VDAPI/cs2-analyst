/** Maps a tactic board can use: every map with a radar config (S17). */
import { MAP_CONFIGS } from "@/lib/utils/maps";

export interface BoardMap {
  name: string;
  displayName: string;
  radar: { posX: number; posY: number; scale: number; width: number; height: number; radarImage: string };
}

export function boardMaps(): BoardMap[] {
  return Object.values(MAP_CONFIGS).map((c) => ({
    name: c.name,
    displayName: c.displayName,
    radar: { posX: c.posX, posY: c.posY, scale: c.scale, width: c.width, height: c.height, radarImage: c.radarImage },
  }));
}
