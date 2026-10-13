/**
 * Friends (S25), database side: the friend list and requests, invite codes,
 * suggestions (FACEIT friends and players of the user's own matches who have
 * an account) and the ranking inputs. Pure ranking and challenges live in
 * ranking.ts / challenges.ts.
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getPlayer } from "@/lib/faceit/api";
import { CACHE_TTL, cached } from "@/lib/scouting/cache";
import { loadProgress } from "@/lib/progress/load";
import type { MatchInput } from "@/lib/progress/metrics";
import { MAX_FRIENDS } from "./ranking";

export type FriendSource = "invite" | "faceit" | "match";

export const isFriendCode = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{12}$/.test(v);

export function newFriendCode(): string {
  return randomBytes(9).toString("base64url");
}

export const friendPath = (code: string) => `/friends/add/${code}`;

/** Most open requests one player may have sent and not had answered. */
export const MAX_PENDING_SENT = 20;
/** Suggestions shown at once. */
const MAX_SUGGESTIONS = 10;
/** Matches whose players are offered as friends. */
const SUGGESTION_MATCHES = 30;

export interface FriendPerson {
  /** The Friendship row. */
  id: string;
  userId: string;
  name: string;
  image: string | null;
  source: string;
  since: string;
}

export interface FriendLists {
  friends: FriendPerson[];
  incoming: FriendPerson[];
  outgoing: FriendPerson[];
}

const personSelect = { id: true, name: true, image: true, faceitNickname: true } as const;

function displayName(u: { name: string | null; faceitNickname: string | null }): string {
  return u.name?.trim() || u.faceitNickname || "Gracz";
}

export async function listFriends(prisma: PrismaClient, userId: string): Promise<FriendLists> {
  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      source: true,
      createdAt: true,
      acceptedAt: true,
      requesterId: true,
      requester: { select: personSelect },
      addressee: { select: personSelect },
    },
  });
  const out: FriendLists = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const mine = r.requesterId === userId;
    const other = mine ? r.addressee : r.requester;
    const person: FriendPerson = {
      id: r.id,
      userId: other.id,
      name: displayName(other),
      image: other.image,
      source: r.source,
      since: (r.acceptedAt ?? r.createdAt).toISOString(),
    };
    if (r.status === "accepted") out.friends.push(person);
    else if (mine) out.outgoing.push(person);
    else out.incoming.push(person);
  }
  out.friends = out.friends.slice(0, MAX_FRIENDS);
  return out;
}

/** The pair's row, whichever of the two asked. */
export function findFriendship(prisma: PrismaClient, a: string, b: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
  });
}

export async function countFriends(prisma: PrismaClient, userId: string): Promise<number> {
  return prisma.friendship.count({
    where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
  });
}

/** The player's invite code, created on first use. */
export async function ensureFriendCode(prisma: PrismaClient, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { friendCode: true } });
  if (user?.friendCode) return user.friendCode;
  const code = newFriendCode();
  await prisma.user.update({ where: { id: userId }, data: { friendCode: code } });
  return code;
}

export interface FriendSuggestion {
  userId: string;
  name: string;
  image: string | null;
  source: Exclude<FriendSource, "invite">;
}

/** FACEIT friend ids of a linked player; empty without the API key or on any API error. */
async function faceitFriendIds(prisma: PrismaClient, faceitId: string): Promise<string[]> {
  if (!process.env.FACEIT_API_KEY) return [];
  try {
    const player = await cached(prisma, `player:${faceitId}`, CACHE_TTL.player, () => getPlayer(faceitId));
    return Array.isArray(player?.friends_ids) ? player.friends_ids.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
  } catch {
    return [];
  }
}

/**
 * People the player may know who have an account here: their FACEIT friends
 * (linked FACEIT on both sides) and players of their own analysed matches
 * (linked Steam). Never anyone they are already connected with.
 */
export async function friendSuggestions(prisma: PrismaClient, userId: string): Promise<FriendSuggestion[]> {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { faceitId: true, steamId: true } });
  if (!me) return [];
  const connected = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  const skip = new Set<string>([userId, ...connected.flatMap((c) => [c.requesterId, c.addresseeId])]);
  const out: FriendSuggestion[] = [];

  const faceitIds = me.faceitId ? await faceitFriendIds(prisma, me.faceitId) : [];
  if (faceitIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { faceitId: { in: faceitIds }, id: { notIn: [...skip] } },
      select: personSelect,
      take: MAX_SUGGESTIONS,
    });
    for (const u of users) {
      skip.add(u.id);
      out.push({ userId: u.id, name: displayName(u), image: u.image, source: "faceit" });
    }
  }

  if (out.length < MAX_SUGGESTIONS) {
    const matches = await prisma.match.findMany({
      where: { upload: { userId, deletedAt: null, pro: false } },
      orderBy: { date: "desc" },
      take: SUGGESTION_MATCHES,
      select: { players: { select: { steamId: true } } },
    });
    const steamIds = [...new Set(matches.flatMap((m) => m.players.map((p) => p.steamId)))].filter((s) => s !== me.steamId);
    if (steamIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { steamId: { in: steamIds }, id: { notIn: [...skip] } },
        select: personSelect,
        take: MAX_SUGGESTIONS - out.length,
      });
      for (const u of users) out.push({ userId: u.id, name: displayName(u), image: u.image, source: "match" });
    }
  }
  return out;
}

/** May `userId` send a request to `targetId`? Only to someone the suggestions offer. */
export async function suggestionSource(prisma: PrismaClient, userId: string, targetId: string): Promise<FriendSuggestion["source"] | null> {
  const list = await friendSuggestions(prisma, userId);
  return list.find((s) => s.userId === targetId)?.source ?? null;
}

export interface RankingInput {
  userId: string;
  name: string;
  isMe: boolean;
  matches: MatchInput[];
}

/** Ranking and challenge inputs: each player's latest matches, read the way the progress page reads them. */
export async function loadRankingInputs(
  prisma: PrismaClient,
  me: { id: string; name: string },
  friends: FriendPerson[],
  limit: number
): Promise<RankingInput[]> {
  const people = [{ userId: me.id, name: me.name, isMe: true }, ...friends.map((f) => ({ userId: f.userId, name: f.name, isMe: false }))];
  const users = await prisma.user.findMany({
    where: { id: { in: people.map((p) => p.userId) } },
    select: { id: true, steamId: true, faceitNickname: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const out: RankingInput[] = [];
  // A few at a time: each one is a handful of queries.
  for (let i = 0; i < people.length; i += 5) {
    const chunk = await Promise.all(
      people.slice(i, i + 5).map(async (p) => {
        const u = byId.get(p.userId);
        const data = await loadProgress(prisma, {
          userId: p.userId,
          sessionSteamId: u?.steamId ?? null,
          faceitNickname: u?.faceitNickname ?? null,
          limit,
        });
        return { ...p, matches: data.matches };
      })
    );
    out.push(...chunk);
  }
  return out;
}
