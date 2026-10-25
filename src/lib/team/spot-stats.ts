/**
 * A player's kills and deaths per position (player page → "Twoje pozycje"):
 * where the kills were made from and where the player died, per map and
 * side, named with the map's callouts, the admin's drawn zones and short
 * names (/callouts). Answers "which angles work for me and which don't".
 */
import type { PrismaClient } from "@prisma/client";
import { getPlaceLookup } from "@/lib/analysis/persist-utility";
import { loadMapLanes } from "./map-lanes-load";
import { shortPlace } from "./map-lanes";
import { withZones } from "./zones";

export interface SpotStat {
  map: string;
  side: "CT" | "T" | "?";
  place: string;
  kills: number;
  deaths: number;
}

/** Spot verdicts: enough samples and a clear ratio either way. */
export const SPOT_MIN_EVENTS = 4;
export const SPOT_BAD_RATIO = 0.6;
export const SPOT_GOOD_RATIO = 1.8;

export function spotVerdict(s: Pick<SpotStat, "kills" | "deaths">): "bad" | "good" | null {
  if (s.kills + s.deaths < SPOT_MIN_EVENTS) return null;
  const ratio = s.kills / Math.max(1, s.deaths);
  if (s.deaths >= 3 && ratio <= SPOT_BAD_RATIO) return "bad";
  if (s.kills >= 3 && ratio >= SPOT_GOOD_RATIO) return "good";
  return null;
}

/** Side in a regulation round from the side the player finished on (MR12; overtime unknown). */
const sideInRound = (finalSide: string, round: number, totalRounds: number): SpotStat["side"] => {
  if (round > 24) return "?";
  if (totalRounds <= 12) return finalSide === "CT" ? "CT" : "T";
  const flip = round <= 12;
  return (finalSide === "CT") !== flip ? "CT" : "T";
};

/** Kills and deaths of `steamId` per map, side and position over the user's own matches. */
export async function playerSpotStats(prisma: PrismaClient, userId: string, steamId: string): Promise<SpotStat[]> {
  const matches = await prisma.match.findMany({
    where: { upload: { kind: "PLAYER", userId, deletedAt: null }, players: { some: { steamId } } },
    orderBy: { date: "desc" },
    take: 60,
    select: {
      map: true,
      players: { where: { steamId }, select: { team: true } },
      _count: { select: { rounds: true } },
      rounds: {
        select: {
          number: true,
          kills: {
            where: { OR: [{ attackerSteamId: steamId }, { victimSteamId: steamId }] },
            select: { attackerSteamId: true, victimSteamId: true, attackerPosX: true, attackerPosY: true, attackerPosZ: true, victimPosX: true, victimPosY: true, victimPosZ: true },
          },
        },
      },
    },
  });
  const lookups = new Map<string, (p: { x: number; y: number; z: number }) => string>();
  for (const map of new Set(matches.map((m) => m.map))) {
    const [{ zones }, base] = await Promise.all([loadMapLanes(prisma, map), getPlaceLookup(prisma, map)]);
    const zoned = withZones(zones, base);
    lookups.set(map, (p) => {
      const name = zoned(p);
      return name ? shortPlace(map, name) : "?";
    });
  }
  const acc = new Map<string, SpotStat>();
  for (const m of matches) {
    const placeOf = lookups.get(m.map)!;
    const finalSide = m.players[0]?.team ?? "CT";
    for (const r of m.rounds) {
      const side = sideInRound(finalSide, r.number, m._count.rounds);
      for (const k of r.kills) {
        if (k.attackerSteamId === k.victimSteamId) continue;
        const killer = k.attackerSteamId === steamId;
        const place = killer
          ? placeOf({ x: k.attackerPosX, y: k.attackerPosY, z: k.attackerPosZ })
          : placeOf({ x: k.victimPosX, y: k.victimPosY, z: k.victimPosZ });
        const key = `${m.map}|${side}|${place}`;
        const s = acc.get(key) ?? { map: m.map, side, place, kills: 0, deaths: 0 };
        acc.set(key, s);
        if (killer) s.kills++;
        else s.deaths++;
      }
    }
  }
  return [...acc.values()].sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths));
}
