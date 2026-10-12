"use client";

import { HeatmapExplorer } from "@/components/maps/heatmap-explorer";
import type { RadarConfig } from "@/lib/canvas/radar";

interface PlayerInfo {
  steamId: string;
  name: string;
  team: "CT" | "T";
}

interface HeatmapViewerProps {
  matchId: string;
  mapName: string;
  mapRaw: string;
  mapConfig: RadarConfig | null;
  players: PlayerInfo[];
  scoreCT: number;
  scoreT: number;
}

/** Kill/death heatmap of a single match. */
export function HeatmapViewer({ matchId, mapName, mapRaw, mapConfig, players, scoreCT, scoreT }: HeatmapViewerProps) {
  return (
    <HeatmapExplorer
      source={{ kind: "match", matchId, scoreCT, scoreT }}
      mapName={mapName}
      mapRaw={mapRaw}
      mapConfig={mapConfig}
      players={players}
    />
  );
}
