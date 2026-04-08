import type { MapConfig } from "@/types";

/**
 * Map radar coordinate configs for converting game-world positions
 * to pixel positions on the radar image.
 *
 * Values sourced from CS2 map .txt files in:
 * steamapps/common/Counter-Strike Global Offensive/game/csgo/resource/overviews/
 *
 * Formula:  pixelX = (gameX - posX) / scale
 *           pixelY = (posY - gameY) / scale
 */
export const MAP_CONFIGS: Record<string, MapConfig> = {
  de_dust2: {
    name: "de_dust2",
    displayName: "Dust II",
    radarImage: "/maps/de_dust2_radar.png",
    posX: -2476,
    posY: 3239,
    scale: 4.4,
    width: 1024,
    height: 1024,
  },
  de_mirage: {
    name: "de_mirage",
    displayName: "Mirage",
    radarImage: "/maps/de_mirage_radar.png",
    posX: -3230,
    posY: 1713,
    scale: 5.0,
    width: 1024,
    height: 1024,
  },
  de_inferno: {
    name: "de_inferno",
    displayName: "Inferno",
    radarImage: "/maps/de_inferno_radar.png",
    posX: -2087,
    posY: 3870,
    scale: 4.9,
    width: 1024,
    height: 1024,
  },
  de_nuke: {
    name: "de_nuke",
    displayName: "Nuke",
    radarImage: "/maps/de_nuke_radar.png",
    posX: -3453,
    posY: 2887,
    scale: 7.0,
    width: 1024,
    height: 1024,
  },
  de_overpass: {
    name: "de_overpass",
    displayName: "Overpass",
    radarImage: "/maps/de_overpass_radar.png",
    posX: -4831,
    posY: 1781,
    scale: 5.2,
    width: 1024,
    height: 1024,
  },
  de_vertigo: {
    name: "de_vertigo",
    displayName: "Vertigo",
    radarImage: "/maps/de_vertigo_radar.png",
    posX: -3168,
    posY: 1762,
    scale: 4.0,
    width: 1024,
    height: 1024,
  },
  de_anubis: {
    name: "de_anubis",
    displayName: "Anubis",
    radarImage: "/maps/de_anubis_radar.png",
    posX: -2796,
    posY: 3328,
    scale: 5.22,
    width: 1024,
    height: 1024,
  },
  de_ancient: {
    name: "de_ancient",
    displayName: "Ancient",
    radarImage: "/maps/de_ancient_radar.png",
    posX: -2953,
    posY: 2164,
    scale: 5.0,
    width: 1024,
    height: 1024,
  },
  de_train: {
    name: "de_train",
    displayName: "Train",
    radarImage: "/maps/de_train_radar.png",
    posX: -2477,
    posY: 2392,
    scale: 4.7,
    width: 1024,
    height: 1024,
  },
};

/**
 * Convert game-world coordinates to pixel coordinates on the radar image.
 */
export function worldToRadar(
  map: MapConfig,
  gameX: number,
  gameY: number
): { x: number; y: number } {
  return {
    x: (gameX - map.posX) / map.scale,
    y: (map.posY - gameY) / map.scale,
  };
}

/**
 * Get map config by name, with fallback.
 */
export function getMapConfig(mapName: string): MapConfig | undefined {
  // Normalize: remove prefixes, handle variations
  const normalized = mapName.toLowerCase().replace(/^(cs_|de_|ar_)/, "de_");
  return MAP_CONFIGS[normalized] ?? MAP_CONFIGS[mapName];
}
