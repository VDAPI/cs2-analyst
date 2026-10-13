import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { MAX_PENDING_SENT, countFriends, findFriendship, suggestionSource } from "@/lib/friends/load";
import { MAX_FRIENDS } from "@/lib/friends/ranking";
import { notifyFriend } from "@/lib/notifications/notify";

const schema = z.object({ userId: z.string().min(1).max(64) });

/**
 * POST /api/friends — a friend request to someone from the suggestions (a
 * FACEIT friend or a player of the user's matches with an account). Anyone
 * else is added through an invite link. The other player gets a notification
 * and accepts on /friends.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("friendAdd", userId);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const targetId = body.data.userId;
  if (targetId === userId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const existing = await findFriendship(prisma, userId, targetId);
  if (existing?.status === "pending" && existing.requesterId === targetId) {
    // They already asked: asking back accepts (same friend cap as PATCH /api/friends/[id]).
    const [mine, theirs] = await Promise.all([countFriends(prisma, userId), countFriends(prisma, targetId)]);
    if (mine >= MAX_FRIENDS || theirs >= MAX_FRIENDS) {
      return NextResponse.json({ error: "Friend limit", max: MAX_FRIENDS }, { status: 409 });
    }
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: "accepted", acceptedAt: new Date() } });
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, faceitNickname: true } });
    await notifyFriend(prisma, { userId: targetId, type: "FRIEND_ACCEPTED", name: me?.name || me?.faceitNickname || "" });
    return NextResponse.json({ id: existing.id, status: "accepted" });
  }
  if (existing) return NextResponse.json({ id: existing.id, status: existing.status });

  const source = await suggestionSource(prisma, userId, targetId);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [mine, pending] = await Promise.all([
    countFriends(prisma, userId),
    prisma.friendship.count({ where: { requesterId: userId, status: "pending" } }),
  ]);
  if (mine >= MAX_FRIENDS) return NextResponse.json({ error: "Friend limit", max: MAX_FRIENDS }, { status: 409 });
  if (pending >= MAX_PENDING_SENT) return NextResponse.json({ error: "Too many pending", max: MAX_PENDING_SENT }, { status: 409 });

  const row = await prisma.friendship.create({
    data: { requesterId: userId, addresseeId: targetId, status: "pending", source },
  });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, faceitNickname: true } });
  await notifyFriend(prisma, { userId: targetId, type: "FRIEND_REQUEST", name: me?.name || me?.faceitNickname || "" });
  return NextResponse.json({ id: row.id, status: row.status });
}
