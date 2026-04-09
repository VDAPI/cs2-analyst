import type {
  FaceitMatchHistoryResponse,
  FaceitMatchDetail,
  FaceitMatchSummary,
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
 * @param playerId - FACEIT player UUID (guid)
 * @param from - Unix timestamp in seconds (fetch matches after this time)
 * @param limit - Max matches to return (default 20)
 */
export async function getMatchHistory(
  playerId: string,
  from: number,
  limit = 20
): Promise<FaceitMatchSummary[]> {
  const url = new URL(`${FACEIT_DATA_API}/players/${playerId}/history`);
  url.searchParams.set("game", "cs2");
  url.searchParams.set("from", from.toString());
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", limit.toString());

  const res = await fetch(url.toString(), { headers: headers() });

  if (!res.ok) {
    throw new Error(`FACEIT API error: ${res.status} ${res.statusText}`);
  }

  const data: FaceitMatchHistoryResponse = await res.json();
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

  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    throw new Error(`FACEIT API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
