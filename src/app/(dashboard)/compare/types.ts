export interface PlayerSummary {
  steamId: string;
  name: string;
  matchCount: number;
  avgKd: number;
  avgHltv: number;
}

export interface PlayerComparisonStats {
  steamId: string;
  name: string;
  matchCount: number;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  kd: number;
  avgAdr: number;
  avgHltv: number;
  avgHsPercent: number;
  totalFlashAssists: number;
  totalUtilityDamage: number;
  totalFirstKills: number;
  totalFirstDeaths: number;
  clutchWinPercent: number;
  recentForm: Array<{ date: string; hltv: number; map: string }>;
  mapStats: Record<
    string,
    {
      matches: number;
      kd: number;
      avgAdr: number;
      avgHltv: number;
    }
  >;
}

export interface RadarDataPoint {
  stat: string;
  player1: number;
  player2: number;
  raw1: string;
  raw2: string;
}

export interface StatRow {
  label: string;
  p1Value: number;
  p2Value: number;
  format: (v: number) => string;
  higherIsBetter: boolean;
}
