/**
 * Rate limiting (S29). Fixed windows counted in Redis (already there for
 * BullMQ), so every Next.js instance shares one count; when Redis is down the
 * count falls back to this process's memory rather than letting everything
 * through or failing the request.
 *
 * Rules are per action, keyed by user id (signed-in actions) or client IP
 * (login, register). `RATE_LIMIT=off` switches it off (local load tests).
 */
import Redis from "ioredis";

export interface RateRule {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

export const RATE_RULES = {
  /** Failed and successful sign-ins per email address. */
  loginEmail: { max: 10, windowMs: 15 * MIN },
  /** Sign-ins per IP, across all addresses (credential stuffing). */
  loginIp: { max: 40, windowMs: 15 * MIN },
  register: { max: 10, windowMs: HOUR },
  upload: { max: 40, windowMs: 10 * MIN },
  /** Starting FACEIT / Premier analyses, retries. */
  analyze: { max: 40, windowMs: 10 * MIN },
  /** FACEIT / Steam history sync (each one calls external APIs). */
  sync: { max: 20, windowMs: 10 * MIN },
  /** Opponent scouting: up to ~40 FACEIT API calls per request. */
  scouting: { max: 20, windowMs: 10 * MIN },
  /** AI coach text (Claude API calls; AI_DAILY_LIMIT caps the cost per day). */
  coach: { max: 30, windowMs: 10 * MIN },
  /**
   * Paid Claude calls per user and day, counted per call (failed ones too):
   * forced rewrites update the same CoachText row, so counting rows alone
   * let them through. Same number as AI_DAILY_LIMIT in src/lib/coach/persist.ts.
   */
  coachAiDaily: { max: 40, windowMs: 24 * HOUR },
  /** Joining a team by invite code (guessing codes). */
  teamJoin: { max: 20, windowMs: 10 * MIN },
  /** Friend requests and adding friends by invite code (guessing codes, spam). */
  friendAdd: { max: 30, windowMs: 10 * MIN },
  /** Small writes: notes, goals, shares, settings, push, feedback, teams. */
  write: { max: 120, windowMs: 10 * MIN },
  avatar: { max: 10, windowMs: 10 * MIN },
  /** Stripe checkout / portal / status sync (each one calls the Stripe API). */
  billing: { max: 20, windowMs: 10 * MIN },
  /** Data export (a big query) and account deletion (asks for the password). */
  account: { max: 5, windowMs: HOUR },
} as const satisfies Record<string, RateRule>;

export type RateRuleName = keyof typeof RATE_RULES;

export interface RateResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
}

/** Decision for the `count`-th hit of a window that ends at `resetAt`. Pure. */
export function decide(rule: RateRule, count: number, resetAt: number, now: number): RateResult {
  return {
    allowed: count <= rule.max,
    remaining: Math.max(0, rule.max - count),
    retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/** Start of the fixed window `now` falls in. Pure. */
export function windowStart(rule: RateRule, now: number): number {
  return Math.floor(now / rule.windowMs) * rule.windowMs;
}

// ─── Stores ──────────────────────────────────────────────

interface Store {
  /** Increments the counter of `key` (expiring at `resetAt`) and returns the new count. */
  incr(key: string, resetAt: number, now: number): Promise<number>;
}

/** In-process counters: the fallback when Redis is unreachable, and the test store. */
export class MemoryStore implements Store {
  private counts = new Map<string, { count: number; resetAt: number }>();

  async incr(key: string, resetAt: number, now: number): Promise<number> {
    if (this.counts.size > 10_000) {
      for (const [k, v] of this.counts) if (v.resetAt <= now) this.counts.delete(k);
    }
    const hit = this.counts.get(key);
    if (!hit || hit.resetAt <= now) {
      this.counts.set(key, { count: 1, resetAt });
      return 1;
    }
    hit.count += 1;
    return hit.count;
  }
}

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      // Fail fast instead of queueing commands while Redis is down; the
      // memory store takes over for that request.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    });
    redis.on("error", () => {});
  }
  return redis;
}

class RedisStore implements Store {
  async incr(key: string, resetAt: number, now: number): Promise<number> {
    const r = getRedis();
    const res = await r.multi().incr(key).pexpire(key, Math.max(1, resetAt - now)).exec();
    const count = res?.[0]?.[1];
    if (typeof count !== "number") throw new Error("rate limit: bad Redis reply");
    return count;
  }
}

const memory = new MemoryStore();
const redisStore = new RedisStore();

export function rateLimitEnabled(): boolean {
  return process.env.RATE_LIMIT !== "off";
}

/** Counts one hit of `rule` for `key` and says whether it is allowed. */
export async function hitRateLimit(
  name: RateRuleName,
  key: string,
  opts: { store?: Store; now?: number } = {}
): Promise<RateResult> {
  const rule: RateRule = RATE_RULES[name];
  const now = opts.now ?? Date.now();
  if (!opts.store && !rateLimitEnabled()) return { allowed: true, remaining: rule.max, retryAfter: 0 };
  const start = windowStart(rule, now);
  const resetAt = start + rule.windowMs;
  const redisKey = `rl:${name}:${key}:${start}`;
  let count: number;
  if (opts.store) {
    count = await opts.store.incr(redisKey, resetAt, now);
  } else {
    try {
      count = await redisStore.incr(redisKey, resetAt, now);
    } catch {
      count = await memory.incr(redisKey, resetAt, now);
    }
  }
  return decide(rule, count, resetAt, now);
}

/**
 * The client's IP for per-IP limits. X-Forwarded-For is a list the client
 * may start itself, so it is read from the right: each trusted reverse proxy
 * in front of the app appends the address it saw, and the entry
 * `TRUSTED_PROXY_HOPS` (default 1) from the end is the one the outermost
 * trusted proxy recorded. Without a proxy, Next.js fills the header with the
 * socket address. Falls back to X-Real-IP, then "unknown".
 */
export function clientIp(
  headers: Pick<Headers, "get"> | Record<string, string | string[] | undefined>,
  hops = trustedProxyHops()
): string {
  const get = (name: string): string | null => {
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name);
    const v = (headers as Record<string, string | string[] | undefined>)[name];
    return Array.isArray(v) ? v.join(",") : (v ?? null);
  };
  const chain = (get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fromChain = chain.length ? chain[Math.max(0, chain.length - hops)] : "";
  return (fromChain || get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

function trustedProxyHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
