/**
 * Premier / matchmaking history via the Steam Web API (opt-in, S18).
 *
 * `ICSGOPlayers_730/GetNextMatchSharingCode` walks the player's history one
 * share code at a time, starting from a share code they gave us and using
 * their own "game authentication code" (Steam → CS2 → match history access).
 * Nothing runs unless the player saved both in Settings and pressed sync.
 */
import type { PrismaClient } from "@prisma/client";
import { decodeShareCode, isShareCode } from "./share-code";

const ENDPOINT = "https://api.steampowered.com/ICSGOPlayers_730/GetNextMatchSharingCode/v1";

/** Steam's own format for the game authentication code: XXXX-XXXXX-XXXX. */
export const AUTH_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{5}-[A-Z0-9]{4}$/;

/** Max share codes one sync walks, so a stale known code can't loop forever. */
export const MAX_CODES_PER_SYNC = 30;

export class SteamHistoryError extends Error {
  constructor(
    message: string,
    readonly code: "no_api_key" | "invalid_auth" | "rate_limited" | "steam_error"
  ) {
    super(message);
  }
}

export type FetchFn = (url: string) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * The share code after `knownCode`, or null when the player has no newer
 * match yet (Steam answers 202 / "n/a").
 */
export async function fetchNextShareCode(
  args: { apiKey: string; steamId: string; authCode: string; knownCode: string },
  fetchFn: FetchFn = (url) => fetch(url, { cache: "no-store" })
): Promise<string | null> {
  const qs = new URLSearchParams({
    key: args.apiKey,
    steamid: args.steamId,
    steamidkey: args.authCode,
    knowncode: args.knownCode,
  });
  const res = await fetchFn(`${ENDPOINT}?${qs}`);
  if (res.status === 202) return null;
  if (res.status === 403 || res.status === 412) {
    throw new SteamHistoryError(
      "Steam rejected the authentication code or share code",
      "invalid_auth"
    );
  }
  if (res.status === 429) throw new SteamHistoryError("Steam rate limit", "rate_limited");
  if (res.status !== 200) {
    throw new SteamHistoryError(`Steam API answered ${res.status}`, "steam_error");
  }
  const body = (await res.json()) as { result?: { nextcode?: string } };
  const next = body.result?.nextcode;
  if (!next || next === "n/a") return null;
  if (!isShareCode(next)) throw new SteamHistoryError("Unexpected Steam answer", "steam_error");
  return next;
}

/** Adds a share code to the player's Premier list (idempotent). */
export async function addSteamMatch(
  prisma: PrismaClient,
  userId: string,
  shareCode: string,
  demoUrl?: string | null
) {
  const decoded = decodeShareCode(shareCode);
  return prisma.steamMatch.upsert({
    where: { userId_shareCode: { userId, shareCode } },
    create: { userId, shareCode, ...decoded, demoUrl: demoUrl ?? null },
    update: demoUrl ? { demoUrl } : {},
  });
}

export interface SteamSyncResult {
  added: number;
  lastShareCode: string;
}

/** Walks the history from the user's newest known share code and stores what's new. */
export async function syncSteamHistory(
  prisma: PrismaClient,
  userId: string,
  fetchFn?: FetchFn
): Promise<SteamSyncResult> {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) throw new SteamHistoryError("STEAM_API_KEY is not set", "no_api_key");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { steamId: true, steamAuthCode: true, steamLastShareCode: true },
  });
  if (!user?.steamId || !user.steamAuthCode || !user.steamLastShareCode) {
    throw new SteamHistoryError("Steam history is not set up", "invalid_auth");
  }

  let known = user.steamLastShareCode;
  let added = 0;
  try {
    for (let i = 0; i < MAX_CODES_PER_SYNC; i++) {
      const next = await fetchNextShareCode(
        { apiKey, steamId: user.steamId, authCode: user.steamAuthCode, knownCode: known },
        fetchFn
      );
      if (!next) break;
      await addSteamMatch(prisma, userId, next);
      known = next;
      added++;
    }
  } finally {
    await prisma.user.update({
      where: { id: userId },
      data: { steamLastShareCode: known, lastSteamSync: new Date() },
    });
  }
  return { added, lastShareCode: known };
}
