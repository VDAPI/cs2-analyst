const MAP_DISPLAY_NAMES: Record<string, string> = {
  de_mirage: "Mirage",
  de_inferno: "Inferno",
  de_dust2: "Dust 2",
  de_nuke: "Nuke",
  de_overpass: "Overpass",
  de_vertigo: "Vertigo",
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_train: "Train",
  de_cache: "Cache",
  de_cobblestone: "Cobblestone",
};

export function mapDisplayName(map: string): string {
  return MAP_DISPLAY_NAMES[map] ?? map;
}
