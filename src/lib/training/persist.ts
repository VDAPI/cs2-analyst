/**
 * DB side of the lineup trainer and the daily routine (S22): mastered
 * lineups, the lineups behind a finding, the day's lineups.
 */
import type { PrismaClient } from "@prisma/client";
import { getMapLineups } from "@/lib/analysis/persist-utility";
import type { Lineup } from "@/lib/analysis/lineups";
import { UTILITY_VERSION, type UtilityThrow } from "@/lib/analysis/utility";
import { MAP_CONFIGS } from "@/lib/utils/maps";
import { hasLineupPractice, practiceLineups, routineLineups, throwForFinding, type LineupPick } from "./lineup-trainer";
import type { Routine } from "./routine";

export async function loadMastered(prisma: PrismaClient, userId: string, map: string): Promise<Set<string>> {
  const rows = await prisma.lineupMastery.findMany({ where: { userId, map }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

export interface FindingPractice {
  findingId: string;
  type: string;
  matchId: string;
  steamId: string;
  roundNumber: number;
  tick: number;
  map: string;
  side: "CT" | "T" | null;
  /** The player's throw, when the utility analysis still has it. */
  thrown: UtilityThrow | null;
  picks: LineupPick[];
}

/**
 * The lineups to practise for one of the user's findings (smoke too early,
 * void smoke, molotov without effect, lineup off target). Null when the
 * finding isn't the user's, or isn't about a grenade.
 */
export async function findingPractice(
  prisma: PrismaClient,
  userId: string,
  findingId: string,
  lineups?: Lineup[]
): Promise<FindingPractice | null> {
  const f = await prisma.finding.findUnique({
    where: { id: findingId },
    select: {
      id: true,
      type: true,
      matchId: true,
      steamId: true,
      roundNumber: true,
      tick: true,
      match: { select: { map: true, upload: { select: { userId: true } } } },
    },
  });
  if (!f || f.match.upload?.userId !== userId || !hasLineupPractice(f.type) || !MAP_CONFIGS[f.match.map]) return null;
  const stats = await prisma.utilityStats.findFirst({
    where: { matchId: f.matchId, steamId: f.steamId, version: UTILITY_VERSION },
    select: { throws: true },
  });
  const throws = Array.isArray(stats?.throws) ? (stats.throws as unknown as UtilityThrow[]) : [];
  const thrown = throwForFinding(throws, f);
  const base = lineups ?? (await getMapLineups(prisma, f.match.map));
  return {
    findingId: f.id,
    type: f.type,
    matchId: f.matchId,
    steamId: f.steamId,
    roundNumber: f.roundNumber,
    tick: f.tick,
    map: f.match.map,
    side: thrown?.side ?? null,
    thrown,
    picks: thrown ? practiceLineups(thrown, f.type, base) : [],
  };
}

/** Today's lineups on the plan's main map: not mastered, of the grenades the day trains. */
export async function loadRoutineLineups(
  prisma: PrismaClient,
  userId: string,
  map: string | null,
  routine: Pick<Routine, "lineupTypes">
): Promise<Lineup[]> {
  if (!map || !MAP_CONFIGS[map] || routine.lineupTypes.length === 0) return [];
  const [lineups, mastered] = await Promise.all([getMapLineups(prisma, map), loadMastered(prisma, userId, map)]);
  return routineLineups(lineups, mastered, { types: routine.lineupTypes });
}
