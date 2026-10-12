/**
 * Players' matchmaking ranks from the demo (S13): CS Rating in Premier
 * demos, the per-map skill group in competitive ones. FACEIT demos carry no
 * rank (their levels come from the FACEIT match room, src/lib/norms/ranks.ts).
 */
import type { RankType } from "@/lib/norms/norms";

/** m_iCompetitiveRankType values that carry a rank we can pool. */
const RANK_TYPES: Record<number, RankType> = { 11: "premier", 12: "competitive" };

export interface DemoRank {
  steamId: string;
  type: RankType;
  value: number;
}

/** Pure: rows of parseTicks(["rank", "comp_rank_type"]) → one rank per player (highest tick wins). */
export function ranksFromTicks(rows: Array<Record<string, unknown>>): DemoRank[] {
  const best = new Map<string, { tick: number; rank: DemoRank }>();
  for (const r of rows) {
    const steamId = r.steamid == null ? "" : String(r.steamid);
    const type = RANK_TYPES[Number(r.comp_rank_type)];
    const value = Number(r.rank);
    const tick = Number(r.tick) || 0;
    if (!steamId || steamId === "0" || !type || !Number.isFinite(value) || value <= 0) continue;
    const prev = best.get(steamId);
    if (!prev || tick >= prev.tick) best.set(steamId, { tick, rank: { steamId, type, value: Math.round(value) } });
  }
  return [...best.values()].map((b) => b.rank);
}

/** Ranks at the given ticks (e.g. round starts). Never throws: a demo without the props gives []. */
export async function parsePlayerRanks(filePath: string, ticks: number[]): Promise<DemoRank[]> {
  if (ticks.length === 0) return [];
  try {
    const parser = await import("@laihoe/demoparser2");
    const rows = parser.parseTicks(filePath.replace(/\\/g, "/"), ["rank", "comp_rank_type"], ticks) as Array<
      Record<string, unknown>
    >;
    return ranksFromTicks(rows ?? []);
  } catch (err) {
    console.warn("[ranks] rank props unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}
