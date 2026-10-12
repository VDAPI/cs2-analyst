/**
 * Roles from the DB (S24). Roles and role profiles live on NormSample rows
 * (one per match, player and side, built by the norms pipeline), so every
 * analysed match has them once its samples are current; a report on a match
 * with older samples rebuilds them first.
 */
import type { PrismaClient } from "@prisma/client";
import { placeLookup } from "@/lib/analysis/places";
import { computeAndPersistNormSamples, NORMS_STAMP } from "@/lib/norms/persist";
import type { NormSide, SampleMetrics } from "@/lib/norms/norms";
import type { Role, SideProfile } from "./roles";
import { asProfile, asRole } from "./view";

export interface RoleSample {
  matchId: string;
  map: string;
  side: NormSide;
  role: Role | null;
  profile: SideProfile | null;
  metrics: SampleMetrics;
}

const SELECT = { matchId: true, map: true, side: true, role: true, profile: true, metrics: true } as const;

function toSample(r: { matchId: string; map: string; side: string; role: string | null; profile: unknown; metrics: unknown }): RoleSample {
  return {
    matchId: r.matchId,
    map: r.map,
    side: r.side as NormSide,
    role: asRole(r.role),
    profile: asProfile(r.profile),
    metrics: (r.metrics ?? {}) as SampleMetrics,
  };
}

/**
 * One player's role samples of a match ("all", "CT", "T"), rebuilding the
 * match's samples first when they are missing or from an older NORMS_STAMP.
 * Empty when the match has nothing to analyse.
 */
export async function loadMatchRole(
  prisma: PrismaClient,
  matchId: string,
  steamId: string
): Promise<Partial<Record<NormSide, RoleSample>>> {
  const read = () =>
    prisma.normSample.findMany({ where: { matchId, steamId, version: NORMS_STAMP }, select: SELECT });
  let rows = await read();
  if (rows.length === 0) {
    const current = await prisma.normSample.count({ where: { matchId, version: NORMS_STAMP } });
    if (current === 0) {
      try {
        await computeAndPersistNormSamples(prisma, matchId);
        rows = await read();
      } catch (err) {
        console.error("[roles] samples unavailable:", err);
      }
    }
  }
  const out: Partial<Record<NormSide, RoleSample>> = {};
  for (const r of rows) out[r.side as NormSide] = toSample(r);
  return out;
}

export interface ProPlayer {
  steamId: string;
  name: string;
  matches: number;
  /** Match roles, most common first. */
  roles: Role[];
  /** Maps, most played first. */
  maps: string[];
}

/** Every player in the pro pool with current samples, most matches first. */
export async function listProPlayers(prisma: PrismaClient): Promise<ProPlayer[]> {
  const rows = await prisma.normSample.findMany({
    where: { pro: true, side: "all", version: NORMS_STAMP },
    select: { matchId: true, steamId: true, map: true, role: true },
    take: 5000,
  });
  if (rows.length === 0) return [];
  const names = await prisma.matchPlayer.findMany({
    where: { matchId: { in: [...new Set(rows.map((r) => r.matchId))] }, steamId: { in: [...new Set(rows.map((r) => r.steamId))] } },
    select: { steamId: true, name: true },
  });
  const nameOf = new Map(names.map((n) => [n.steamId, n.name]));
  const by = new Map<string, { matches: Set<string>; roles: Map<Role, number>; maps: Map<string, number> }>();
  for (const r of rows) {
    const p = by.get(r.steamId) ?? { matches: new Set<string>(), roles: new Map<Role, number>(), maps: new Map<string, number>() };
    p.matches.add(r.matchId);
    p.maps.set(r.map, (p.maps.get(r.map) ?? 0) + 1);
    const role = asRole(r.role);
    if (role) p.roles.set(role, (p.roles.get(role) ?? 0) + 1);
    by.set(r.steamId, p);
  }
  return [...by]
    .map(([steamId, p]) => ({
      steamId,
      name: nameOf.get(steamId) ?? steamId,
      matches: p.matches.size,
      roles: [...p.roles].sort((a, b) => b[1] - a[1]).map(([role]) => role),
      maps: [...p.maps].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([map]) => map),
    }))
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
}

/** A pro's samples on one side (and map, unless "all"), newest first. */
export async function proSamples(
  prisma: PrismaClient,
  { steamId, side, map }: { steamId: string; side: "CT" | "T"; map: string }
): Promise<RoleSample[]> {
  const rows = await prisma.normSample.findMany({
    where: { steamId, side, pro: true, version: NORMS_STAMP, ...(map !== "all" ? { map } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: SELECT,
  });
  return rows.map(toSample);
}

/** The player's own samples on one side (and map) from their latest analysed matches. */
export async function playerSamples(
  prisma: PrismaClient,
  { userId, steamId, side, map, take = 10 }: { userId: string; steamId: string; side: NormSide; map: string; take?: number }
): Promise<RoleSample[]> {
  const rows = await prisma.normSample.findMany({
    where: {
      steamId,
      side,
      pro: false,
      version: NORMS_STAMP,
      match: { upload: { userId, deletedAt: null }, ...(map !== "all" ? { map } : {}) },
    },
    orderBy: { match: { date: "desc" } },
    take,
    select: SELECT,
  });
  return rows.map(toSample);
}

/** Fewer pro profiles than this on a map → use every map. */
export const MIN_ROLE_PROFILES = 5;

/** Profiles of every pro who played `role` on `side` (map first, every map when too few). */
export async function roleProfiles(
  prisma: PrismaClient,
  { role, side, map }: { role: Role; side: "CT" | "T"; map: string }
): Promise<SideProfile[]> {
  const read = async (onMap: boolean) =>
    (
      await prisma.normSample.findMany({
        where: { pro: true, role, side, version: NORMS_STAMP, ...(onMap ? { map } : {}) },
        select: { profile: true },
        take: 2000,
      })
    )
      .map((r) => asProfile(r.profile))
      .filter((p): p is SideProfile => p != null);
  if (map !== "all") {
    const onMap = await read(true);
    if (onMap.length >= MIN_ROLE_PROFILES) return onMap;
  }
  return read(false);
}

/** Callout lookup for a map, or null when no demo of it has named places yet. */
export async function mapPlaceLookup(prisma: PrismaClient, map: string) {
  if (map === "all") return null;
  const cells = await prisma.mapPlaceCell.findMany({
    where: { map },
    select: { cx: true, cy: true, cz: true, place: true, count: true },
  });
  return cells.length > 0 ? placeLookup(cells) : null;
}
