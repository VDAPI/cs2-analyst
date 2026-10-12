/**
 * Store each player's rank in a match (S13) so the report can compare them
 * with players of the same rank: FACEIT levels from the match room (needs
 * FACEIT_API_KEY), Premier/competitive ranks from the demo. Best-effort: a
 * missing key, an API error or a demo without the props only leaves the
 * rank empty.
 */
import type { PrismaClient } from "@prisma/client";
import { getMatchRoom, getPlayer } from "@/lib/faceit/api";
import { cached, CACHE_TTL } from "@/lib/scouting/cache";
import type { DemoRank } from "@/lib/parsers/ranks";

/** A finished match's room never changes. */
const ROOM_TTL = 30 * 24 * 60 * 60;

/** steamId → FACEIT level the player had in that match (from the room's rosters). */
export async function faceitLevelsForMatch(prisma: PrismaClient, faceitMatchId: string): Promise<Map<string, number>> {
  const room = await cached(prisma, `room-final:${faceitMatchId}`, ROOM_TTL, () => getMatchRoom(faceitMatchId));
  const levels = new Map<string, number>();
  for (const faction of Object.values(room.teams ?? {})) {
    for (const p of faction?.roster ?? []) {
      if (p.game_player_id && p.game_skill_level) levels.set(p.game_player_id, p.game_skill_level);
    }
  }
  return levels;
}

/** Current FACEIT level of a linked account. */
async function currentFaceitLevel(prisma: PrismaClient, faceitId: string): Promise<number | null> {
  const player = await cached(prisma, `player:${faceitId}`, CACHE_TTL.player, () => getPlayer(faceitId));
  return player.games?.cs2?.skill_level ?? null;
}

/**
 * Fill MatchPlayer.rankType/rankValue for a freshly parsed match. Order:
 * FACEIT room levels (FACEIT uploads), ranks in the demo, then — for players
 * with a linked FACEIT account and nothing else — their current level.
 */
export async function persistMatchRanks(
  prisma: PrismaClient,
  matchId: string,
  { faceitMatchId, demoRanks }: { faceitMatchId: string | null; demoRanks: DemoRank[] }
): Promise<number> {
  const players = await prisma.matchPlayer.findMany({
    where: { matchId },
    select: { id: true, steamId: true, user: { select: { faceitId: true } } },
  });
  const hasKey = !!process.env.FACEIT_API_KEY;
  let room = new Map<string, number>();
  if (faceitMatchId && hasKey) {
    room = await faceitLevelsForMatch(prisma, faceitMatchId).catch((err) => {
      console.warn(`[ranks] FACEIT room ${faceitMatchId} unavailable:`, err instanceof Error ? err.message : err);
      return new Map<string, number>();
    });
  }
  const fromDemo = new Map(demoRanks.map((r) => [r.steamId, r]));

  let stored = 0;
  for (const p of players) {
    let rank: { type: string; value: number } | null = null;
    const level = room.get(p.steamId);
    if (level) rank = { type: "faceit", value: level };
    else if (fromDemo.has(p.steamId)) rank = fromDemo.get(p.steamId)!;
    else if (hasKey && p.user?.faceitId) {
      const current = await currentFaceitLevel(prisma, p.user.faceitId).catch(() => null);
      if (current) rank = { type: "faceit", value: current };
    }
    if (!rank) continue;
    await prisma.matchPlayer.update({ where: { id: p.id }, data: { rankType: rank.type, rankValue: rank.value } });
    stored++;
  }
  return stored;
}
