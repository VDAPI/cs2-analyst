/**
 * Filters for the FACEIT history picker. Pure, so the regression test can
 * cover them without a database.
 */
export type ResultFilter = "all" | "WIN" | "LOSS";
export type PeriodFilter = "all" | "7" | "30" | "90";

export interface HistoryFilters {
  map: string; // "all" or a map name like "de_mirage"
  result: ResultFilter;
  period: PeriodFilter;
}

export const DEFAULT_FILTERS: HistoryFilters = { map: "all", result: "all", period: "all" };

export interface FilterableMatch {
  map: string;
  date: string | Date;
  result: "WIN" | "LOSS" | null;
}

export function filterHistory<T extends FilterableMatch>(
  matches: T[],
  f: HistoryFilters,
  now: Date = new Date()
): T[] {
  const since =
    f.period === "all" ? null : now.getTime() - Number(f.period) * 24 * 60 * 60 * 1000;
  return matches.filter((m) => {
    if (f.map !== "all" && m.map !== f.map) return false;
    if (f.result !== "all" && m.result !== f.result) return false;
    if (since !== null && new Date(m.date).getTime() < since) return false;
    return true;
  });
}

/** Distinct maps in the history, most played first. */
export function historyMaps(matches: FilterableMatch[]): string[] {
  const counts = new Map<string, number>();
  for (const m of matches) counts.set(m.map, (counts.get(m.map) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([m]) => m);
}
