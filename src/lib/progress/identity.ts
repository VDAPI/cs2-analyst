/**
 * Which player in the user's demos is the user (S16 progress, public
 * profile). Pure, covered by `npm run test:progress`.
 *
 * Order: an explicit pick (?player=), the linked Steam account, the linked
 * FACEIT nickname matched against in-game names, then the player who appears
 * in clearly most of the user's demos (the uploader plays in their own demos).
 */

export interface Appearance {
  steamId: string;
  name: string;
  date: string; // ISO, for picking the latest name
}

export interface Candidate {
  steamId: string;
  name: string;
  matches: number;
}

export type ResolvedHow = "requested" | "steam" | "faceit" | "frequent" | "none";

/** Share of the user's matches the top player must appear in to be picked without a link. */
export const FREQUENT_SHARE = 0.6;
export const MAX_CANDIDATES = 8;

export function playerCandidates(appearances: Appearance[]): Candidate[] {
  const by = new Map<string, { n: number; name: string; date: string }>();
  for (const a of appearances) {
    const cur = by.get(a.steamId);
    if (!cur) by.set(a.steamId, { n: 1, name: a.name, date: a.date });
    else {
      cur.n++;
      if (a.date > cur.date) {
        cur.name = a.name;
        cur.date = a.date;
      }
    }
  }
  return [...by.entries()]
    .map(([steamId, v]) => ({ steamId, name: v.name, matches: v.n }))
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
}

export function resolvePlayer(opts: {
  requested?: string | null;
  sessionSteamId?: string | null;
  faceitNickname?: string | null;
  appearances: Appearance[];
  totalMatches: number;
}): { steamId: string | null; how: ResolvedHow; candidates: Candidate[] } {
  const all = playerCandidates(opts.appearances);
  const candidates = all.slice(0, MAX_CANDIDATES);
  const has = (id: string | null | undefined) => !!id && all.some((c) => c.steamId === id);

  if (has(opts.requested)) return { steamId: opts.requested!, how: "requested", candidates };
  if (has(opts.sessionSteamId)) return { steamId: opts.sessionSteamId!, how: "steam", candidates };
  const nick = opts.faceitNickname?.trim().toLowerCase();
  if (nick) {
    const hit = all.find((c) => opts.appearances.some((a) => a.steamId === c.steamId && a.name.trim().toLowerCase() === nick));
    if (hit) return { steamId: hit.steamId, how: "faceit", candidates };
  }
  const [top, second] = all;
  if (
    top &&
    top.matches >= 2 &&
    top.matches >= FREQUENT_SHARE * opts.totalMatches &&
    (!second || top.matches > second.matches)
  ) {
    return { steamId: top.steamId, how: "frequent", candidates };
  }
  return { steamId: null, how: "none", candidates };
}
