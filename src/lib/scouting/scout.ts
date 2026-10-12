/**
 * Fetch everything a scouting card needs for one FACEIT match room: the room,
 * then profile, lifetime stats and recent matches of all 10 players, each
 * through the response cache. No demos are downloaded.
 */
import type { PrismaClient } from "@prisma/client";
import {
  FaceitApiError,
  getMatchRoom,
  getPlayer,
  getPlayerRecentGames,
  getPlayerStats,
} from "@/lib/faceit/api";
import type { FaceitRoomRosterPlayer } from "@/lib/faceit/types";
import { cached, CACHE_TTL } from "./cache";
import { buildTeam, factionOf, roomMaps, summarizePlayer, type ScoutReport } from "./analysis";

/** Players fetched at once, 3 Data API calls each: 10 players finish in 3 rounds. */
const PLAYERS_AT_ONCE = 4;

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 404 means "no such data" (e.g. a player who never played CS2 on FACEIT), not an outage. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof FaceitApiError && err.status === 404) return null;
    throw err;
  }
}

export class RoomNotFoundError extends Error {}

export async function scoutRoom(
  prisma: PrismaClient,
  matchId: string,
  viewerFaceitId: string | null
): Promise<ScoutReport> {
  const room = await cached(prisma, `room:${matchId}`, CACHE_TTL.room, () => orNull(getMatchRoom(matchId)));
  if (!room || !room.teams?.faction1 || !room.teams.faction2) throw new RoomNotFoundError(matchId);

  const { pool: mapPool, picked } = roomMaps(room);

  const rosters = (["faction1", "faction2"] as const).map((f) => room.teams?.[f]?.roster ?? []);
  const everyone: FaceitRoomRosterPlayer[] = rosters.flat();

  const summaries = await pool(everyone, PLAYERS_AT_ONCE, async (p) => {
    const id = p.player_id;
    const [profile, stats, games] = await Promise.all([
      cached(prisma, `player:${id}`, CACHE_TTL.player, () => orNull(getPlayer(id))),
      cached(prisma, `player-stats:${id}`, CACHE_TTL.playerStats, () => orNull(getPlayerStats(id))),
      cached(prisma, `player-games:${id}`, CACHE_TTL.recentGames, () => orNull(getPlayerRecentGames(id))),
    ]);
    return summarizePlayer(p, profile, stats, games);
  });
  const [first, second] = [summaries.slice(0, rosters[0].length), summaries.slice(rosters[0].length)];

  const teamName = (f: "faction1" | "faction2", fallback: string) => room.teams?.[f]?.name || fallback;
  return {
    matchId: room.match_id ?? matchId,
    status: room.status,
    competition: room.competition_name ?? null,
    faceitUrl: room.faceit_url?.replace("{lang}", "pl") ?? null,
    mapPool,
    pickedMap: picked,
    teams: [
      buildTeam("faction1", teamName("faction1", "Drużyna 1"), room.teams.faction1.avatar || null, first, mapPool),
      buildTeam("faction2", teamName("faction2", "Drużyna 2"), room.teams.faction2.avatar || null, second, mapPool),
    ],
    myFaction: factionOf(room, viewerFaceitId),
    fetchedAt: new Date().toISOString(),
  };
}
