/**
 * Postgres-backed cache for FACEIT Data API responses. Scouting a room asks
 * for ~30 responses (3 per player); the same players show up again when the
 * room is reopened or a teammate scouts it, so caching keeps the room fast
 * and the API key well under its rate limit.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

export const CACHE_TTL = {
  /** The room changes during veto (map pick), so keep it short. */
  room: 60,
  player: 6 * 60 * 60,
  playerStats: 60 * 60,
  recentGames: 20 * 60,
} as const;

/** How long expired rows stay before a write sweeps them out. */
const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;

/** One fetch per key at a time inside this process, even when two rooms share a player. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Return the cached value for `key`, or run `load`, store its result for
 * `ttlSeconds` and return it. A `null` result (e.g. a player without CS2
 * stats) is cached too. Cache failures never fail the request.
 */
export async function cached<T>(
  prisma: PrismaClient,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>
): Promise<T> {
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    const hit = await prisma.faceitApiCache.findUnique({ where: { key } }).catch(() => null);
    if (hit && hit.expiresAt.getTime() > Date.now()) {
      return (hit.body as { v: T }).v;
    }

    const value = await load();
    const body = { v: value } as unknown as Prisma.InputJsonValue;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await prisma.faceitApiCache
      .upsert({ where: { key }, create: { key, body, expiresAt }, update: { body, expiresAt } })
      .catch((err: unknown) => console.warn("[scouting] cache write failed:", key, err));
    if (Math.random() < 0.05) {
      await prisma.faceitApiCache
        .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - SWEEP_AFTER_MS) } } })
        .catch(() => undefined);
    }
    return value;
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}
