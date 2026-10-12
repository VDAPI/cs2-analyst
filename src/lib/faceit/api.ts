import type {
  FaceitMatchHistoryResponse,
  FaceitMatchDetail,
  FaceitMatchRoom,
  FaceitMatchSummary,
  FaceitPlayer,
  FaceitPlayerGames,
  FaceitPlayerStats,
} from "./types";

const FACEIT_DATA_API = "https://open.faceit.com/data/v4";

function getApiKey(): string {
  const key = process.env.FACEIT_API_KEY;
  if (!key) throw new Error("FACEIT_API_KEY is not set");
  return key;
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: "application/json",
  };
}

/**
 * Fetch a player's recent CS2 match history from FACEIT Data API.
 * Uses offset/limit pagination — no "from" filter (unreliable).
 * @param playerId - FACEIT player UUID (guid)
 * @param limit - Max matches to return (default 20)
 */
export async function getMatchHistory(
  playerId: string,
  limit = 20
): Promise<FaceitMatchSummary[]> {
  const url = new URL(`${FACEIT_DATA_API}/players/${playerId}/history`);
  url.searchParams.set("game", "cs2");
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", limit.toString());

  console.log("[FACEIT API] GET", url.toString());
  const res = await fetch(url.toString(), { headers: headers() });

  if (!res.ok) {
    const body = await res.text();
    console.error("[FACEIT API] Error:", res.status, body);
    throw new Error(`FACEIT API error: ${res.status} ${res.statusText}`);
  }

  const data: FaceitMatchHistoryResponse = await res.json();
  console.log("[FACEIT API] Response: items =", data.items?.length ?? 0);
  if (data.items?.length) {
    console.log("[FACEIT API] First match:", data.items[0].match_id, "status:", data.items[0].status);
  }
  return data.items ?? [];
}

/**
 * Fetch full match details including demo URL.
 * @param matchId - FACEIT match ID
 */
export async function getMatchDetails(
  matchId: string
): Promise<FaceitMatchDetail> {
  const url = `${FACEIT_DATA_API}/matches/${matchId}`;
  console.log("[FACEIT API] GET", url);

  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const body = await res.text();
    console.error("[FACEIT API] Match details error:", res.status, body);
    throw new Error(`FACEIT API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log("[FACEIT API] Match details demo_url:", JSON.stringify(data.demo_url));
  return data;
}

/** A Data API call that failed; `status` lets callers tell 404 from an outage. */
export class FaceitApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "FaceitApiError";
  }
}

async function dataGet<T>(path: string): Promise<T> {
  const res = await fetch(`${FACEIT_DATA_API}${path}`, {
    headers: headers(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new FaceitApiError(res.status, `FACEIT API error: ${res.status} ${res.statusText} (${path})`);
  }
  return (await res.json()) as T;
}

/** The match room (rosters, map veto) — works before, during and after the match. */
export function getMatchRoom(matchId: string): Promise<FaceitMatchRoom> {
  return dataGet(`/matches/${encodeURIComponent(matchId)}`);
}

/** Player profile with CS2 level and ELO. */
export function getPlayer(playerId: string): Promise<FaceitPlayer> {
  return dataGet(`/players/${encodeURIComponent(playerId)}`);
}

/** Lifetime CS2 stats with one segment per map. */
export function getPlayerStats(playerId: string): Promise<FaceitPlayerStats> {
  return dataGet(`/players/${encodeURIComponent(playerId)}/stats/cs2`);
}

/** Per-match stats of the player's most recent CS2 matches, newest first. */
export function getPlayerRecentGames(playerId: string, limit = 20): Promise<FaceitPlayerGames> {
  return dataGet(`/players/${encodeURIComponent(playerId)}/games/cs2/stats?offset=0&limit=${limit}`);
}
