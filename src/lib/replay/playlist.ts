/**
 * Replay playlists (team analysis → "Odtwórz po kolei"): a list of rounds
 * carried in the replay URL (`?pl=<matchId>.<round>.<tick>~…&pi=<index>`),
 * so the 2D replay can step to the next round of the list. Pure and
 * browser-safe.
 */

export interface PlaylistEntry {
  matchId: string;
  round: number;
  tick: number;
}

/** Rounds a playlist may carry (URL length). */
export const MAX_PLAYLIST = 100;

export function encodePlaylist(entries: PlaylistEntry[]): string {
  return entries
    .slice(0, MAX_PLAYLIST)
    .map((e) => `${e.matchId}.${e.round}.${Math.max(0, Math.round(e.tick))}`)
    .join("~");
}

export function decodePlaylist(raw: string | undefined | null): PlaylistEntry[] {
  if (!raw) return [];
  return raw
    .split("~")
    .slice(0, MAX_PLAYLIST)
    .flatMap((part) => {
      const m = /^([A-Za-z0-9_-]{1,40})\.(\d{1,3})\.(\d{1,9})$/.exec(part);
      return m ? [{ matchId: m[1], round: Number(m[2]), tick: Number(m[3]) }] : [];
    });
}

/** The replay URL of entry `index` of a playlist (`full` opens the big view). */
export function playlistHref(entries: PlaylistEntry[], index: number, full = false): string {
  const e = entries[index];
  if (!e) return "/replay";
  const q = new URLSearchParams({ round: String(e.round), tick: String(e.tick), pl: encodePlaylist(entries), pi: String(index) });
  if (full) q.set("view", "full");
  return `/replay/${e.matchId}?${q.toString()}`;
}
