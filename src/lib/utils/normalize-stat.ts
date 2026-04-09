interface StatRange {
  min: number;
  max: number;
}

const STAT_RANGES: Record<string, StatRange> = {
  kd: { min: 0.5, max: 2.0 },
  adr: { min: 40, max: 120 },
  hltv: { min: 0.5, max: 2.0 },
  hsPercent: { min: 20, max: 70 },
  clutchWinPercent: { min: 0, max: 50 },
  firstKillsPerMatch: { min: 0, max: 5 },
};

export function normalizeStat(key: string, value: number): number {
  const range = STAT_RANGES[key];
  if (!range) return value;
  return Math.max(
    0,
    Math.min(100, ((value - range.min) / (range.max - range.min)) * 100)
  );
}
