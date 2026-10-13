/**
 * Public links (S16): share token format, public profile slugs and the public
 * URLs built from them. Pure and browser-safe (tokens are minted in
 * token.ts), covered by `npm run test:progress`.
 */

export type ShareKind = "report" | "moment" | "clip";

export function isShareToken(s: unknown): s is string {
  return typeof s === "string" && /^[A-Za-z0-9_-]{22}$/.test(s);
}

/**
 * The `?round=` of a replay data route (ticks, kills, bombs, winprob): a
 * round number 1–999, `fallback` when absent, null when malformed (answer
 * 400; a NaN or out-of-range Int reaching Prisma would throw a 500).
 */
export function parseRoundParam(raw: string | null, fallback = 1): number | null {
  if (raw == null || raw === "") return fallback;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

export const SLUG_MIN = 3;
export const SLUG_MAX = 30;
const RESERVED_SLUGS = new Set(["admin", "api", "settings", "login", "register", "me", "new", "edit", "null", "undefined"]);

/** Lower-case, ASCII, dashes for anything else; Polish letters folded. */
export function normalizeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) &&
    !slug.includes("--") &&
    !RESERVED_SLUGS.has(slug)
  );
}

/** A starting slug from the player's name; a random suffix keeps it unique-ish. */
export function suggestSlug(name: string | null | undefined, suffix: string): string {
  const base = normalizeSlug(name ?? "").slice(0, SLUG_MAX - 5) || "gracz";
  const slug = base.length >= SLUG_MIN ? base : `gracz-${base}`;
  return `${slug}-${suffix}`.slice(0, SLUG_MAX);
}

export const sharePath = (token: string) => `/s/${token}`;
export const profilePath = (slug: string) => `/u/${slug}`;

/** Owner-only deep link into the full replay at a moment. */
export function momentReplayPath(matchId: string, m: { round: number; tick: number; player?: string | null }): string {
  const q = new URLSearchParams({ round: String(m.round), tick: String(Math.round(m.tick)) });
  if (m.player) q.set("player", m.player);
  return `/replay/${matchId}?${q}`;
}

/** Seconds of replay shown before and after a shared moment. */
export const MOMENT_CLIP = { before: 5, after: 5 };

/** Longest map note, in characters. */
export const MAX_NOTE_LENGTH = 280;
