/**
 * Compute and store UtilityStats for one match from the replay data already in
 * the DB (RoundTicks, GrenadeEvent, grenade ShotEvents, DamageEvent, Kill,
 * BombEvent) — no .dem needed. Called by the parse pipeline, and lazily by the
 * findings for matches analysed before S11 or with an older UTILITY_VERSION.
 *
 * Also the map-wide data utility findings and the lineups screen read: callout
 * cells (MapPlaceCell) and the lineup base built from every match's throws.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { decodeRoundTicks } from "@/lib/replay/round-ticks";
import { analyzeUtility, UTILITY_VERSION, type GrenadeKind, type UtilityFrame, type UtilityInput, type UtilityThrow } from "./utility";
import { buildLineups, type Lineup, type LineupThrow } from "./lineups";
import { placeLookup, type PlaceCell } from "./places";
import type { Point3 } from "./utility";

const GRENADE_WEAPONS = [
  "weapon_smokegrenade", "weapon_flashbang", "weapon_hegrenade", "weapon_molotov", "weapon_incgrenade", "weapon_decoy",
  "smokegrenade", "flashbang", "hegrenade", "molotov", "incgrenade", "decoy",
];

const KIND: Record<string, GrenadeKind> = {
  SMOKE: "SMOKE",
  FLASH: "FLASH",
  HE: "HE",
  MOLOTOV: "MOLOTOV",
  INCENDIARY: "MOLOTOV",
  DECOY: "DECOY",
};

const asStrings = (v: Prisma.JsonValue | null): string[] | null =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;

/** The analysis input for one match from the DB, or null when there is nothing to analyse. */
export async function loadUtilityInput(prisma: PrismaClient, matchId: string): Promise<UtilityInput | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      tickRate: true,
      rounds: {
        orderBy: { number: "asc" },
        select: {
          number: true,
          startTick: true,
          endTick: true,
          ticks: true,
          grenades: { select: { tick: true, throwerSteamId: true, grenadeType: true, landPosX: true, landPosY: true, landPosZ: true } },
          shots: {
            where: { weapon: { in: GRENADE_WEAPONS } },
            select: { tick: true, steamId: true, weapon: true, x: true, y: true, z: true, pitch: true, yaw: true, velX: true, velY: true, velZ: true },
          },
          damages: { select: { tick: true, attackerSteamId: true, victimSteamId: true, weapon: true, dmgHealth: true } },
          kills: { select: { tick: true, attackerSteamId: true, victimSteamId: true, victimInventory: true } },
          bombs: { where: { type: "PLANTED" }, select: { tick: true } },
        },
      },
    },
  });
  if (!match || !match.rounds.some((r) => r.ticks)) return null;

  return {
    tickRate: match.tickRate,
    rounds: match.rounds.map((r) => ({
      number: r.number,
      startTick: r.startTick,
      endTick: r.endTick,
      frames: r.ticks ? (decodeRoundTicks(r.ticks) as UtilityFrame[]) : [],
    })),
    detonations: match.rounds.flatMap((r) =>
      r.grenades.map((g) => ({
        tick: g.tick,
        roundNumber: r.number,
        throwerSteamId: g.throwerSteamId,
        type: KIND[g.grenadeType],
        x: g.landPosX,
        y: g.landPosY,
        z: g.landPosZ,
      }))
    ),
    throws: match.rounds.flatMap((r) => r.shots.map((s) => ({ ...s, roundNumber: r.number }))),
    damages: match.rounds.flatMap((r) => r.damages.map((d) => ({ ...d, roundNumber: r.number }))),
    kills: match.rounds.flatMap((r) =>
      r.kills.map((k) => ({ ...k, roundNumber: r.number, victimInventory: asStrings(k.victimInventory) }))
    ),
    plants: match.rounds.flatMap((r) => r.bombs.map((b) => ({ roundNumber: r.number, tick: b.tick }))),
  };
}

/** Returns the number of players stored, or 0 when the match has no replay data. */
export async function computeAndPersistUtility(prisma: PrismaClient, matchId: string): Promise<number> {
  const input = await loadUtilityInput(prisma, matchId);
  if (!input) return 0;

  const results = analyzeUtility(input);

  // Serialised per match (like findings): two first views after a version
  // bump would otherwise interleave delete+insert and hit @@unique([matchId, steamId]).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`utility:${matchId}`}))`;
    await tx.utilityStats.deleteMany({ where: { matchId } });
    await tx.utilityStats.createMany({
      data: results.map(({ throws, moments, ...rest }) => ({
        ...rest,
        matchId,
        version: UTILITY_VERSION,
        throws: throws as unknown as Prisma.InputJsonValue,
        moments: moments as unknown as Prisma.InputJsonValue,
      })),
    });
  });
  return results.length;
}

/** Stored stats, recomputed first when missing or from an older analysis version. */
export async function getUtilityStats(prisma: PrismaClient, matchId: string) {
  let rows = await prisma.utilityStats.findMany({ where: { matchId } });
  if (rows.length === 0 || rows.some((r) => r.version !== UTILITY_VERSION)) {
    const stored = await computeAndPersistUtility(prisma, matchId);
    if (stored > 0) rows = await prisma.utilityStats.findMany({ where: { matchId } });
  }
  return rows;
}

// ─── Callouts ────────────────────────────────────────────

/** Add a demo's callout samples to the map's grid (counts are summed). */
export async function persistPlaceCells(prisma: PrismaClient, map: string, cells: PlaceCell[]): Promise<void> {
  const CHUNK = 2000;
  for (let i = 0; i < cells.length; i += CHUNK) {
    const part = cells.slice(i, i + CHUNK);
    await prisma.$executeRaw`
      INSERT INTO "MapPlaceCell" ("map", "cx", "cy", "cz", "place", "count")
      SELECT ${map}::text, * FROM unnest(
        ${part.map((c) => c.cx)}::int[], ${part.map((c) => c.cy)}::int[], ${part.map((c) => c.cz)}::int[],
        ${part.map((c) => c.place)}::text[], ${part.map((c) => c.count)}::int[]
      )
      ON CONFLICT ("map", "cx", "cy", "cz", "place")
      DO UPDATE SET "count" = "MapPlaceCell"."count" + EXCLUDED."count"`;
  }
}

/** Callout lookup for a map (returns null for every position until a demo of it was parsed since S11). */
export async function getPlaceLookup(prisma: PrismaClient, map: string): Promise<(p: Point3) => string | null> {
  const cells = await prisma.mapPlaceCell.findMany({
    where: { map },
    select: { cx: true, cy: true, cz: true, place: true, count: true },
  });
  return placeLookup(cells);
}

// ─── Lineup base ─────────────────────────────────────────

/** Matches on a map considered for the lineup base (newest first). */
const LINEUP_MATCH_LIMIT = 400;

/** Every lineup learned on a map so far, named from the map's callouts. */
export async function getMapLineups(
  prisma: PrismaClient,
  map: string,
  placeOf?: (p: Point3) => string | null
): Promise<Lineup[]> {
  const rows = await prisma.utilityStats.findMany({
    where: { version: UTILITY_VERSION, match: { map } },
    select: { matchId: true, steamId: true, throws: true },
    orderBy: { createdAt: "desc" },
    take: LINEUP_MATCH_LIMIT * 10,
  });
  const throws: LineupThrow[] = rows.flatMap((r) =>
    Array.isArray(r.throws)
      ? (r.throws as unknown as UtilityThrow[]).map((t) => ({ ...t, matchId: r.matchId, steamId: r.steamId }))
      : []
  );
  return buildLineups(throws, placeOf ?? (await getPlaceLookup(prisma, map)));
}
