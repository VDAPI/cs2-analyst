"use client";

import { HeatmapExplorer } from "@/components/maps/heatmap-explorer";
import type { RadarConfig } from "@/lib/canvas/radar";

interface PlayerInfo {
  steamId: string;
  name: string;
  team: "CT" | "T";
}

interface MatchInfo {
  id: string;
  date: string;
  scoreCT: number;
  scoreT: number;
}

interface CrossMatchHeatmapProps {
  mapName: string;
  mapRaw: string;
  mapConfig: RadarConfig | null;
  matches: MatchInfo[];
  players: PlayerInfo[];
}

/** Kill/death heatmap across all of the user's matches on one map. */
export function CrossMatchHeatmap({ mapName, mapRaw, mapConfig, matches, players }: CrossMatchHeatmapProps) {
  return (
    <HeatmapExplorer
      source={{ kind: "map", matches }}
      mapName={mapName}
      mapRaw={mapRaw}
      mapConfig={mapConfig}
      players={players}
    />
  );
}
