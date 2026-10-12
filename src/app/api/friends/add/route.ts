import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { countFriends, findFriendship, isFriendCode } from "@/lib/friends/load";
import { MAX_FRIENDS } from "@/lib/friends/ranking";
import { notifyFriend } from "@/lib/notifications/notify";

const schema = z.object({ code: z.string().refine(isFriendCode) });

/**
 * POST /api/friends/add — accept a friend invite link. The link's owner
 * shared it, so the friendship starts accepted (a pending request between
 * the two is accepted too).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("friendAdd", userId);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  const owner = await prisma.user.findUnique({ where: { friendCode: body.data.code }, select: { id: true } });
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (owner.id === userId) return NextResponse.json({ error: "Own link" }, { status: 400 });

  const existing = await findFriendship(prisma, userId, owner.id);
  if (existing?.status === "accepted") return NextResponse.json({ id: existing.id, status: "accepted" });
  const [mine, theirs] = await Promise.all([countFriends(prisma, userId), countFriends(prisma, owner.id)]);
  if (mine >= MAX_FRIENDS || theirs >= MAX_FRIENDS) {
    return NextResponse.json({ error: "Friend limit", max: MAX_FRIENDS }, { status: 409 });
  }

  const row = existing
    ? await prisma.friendship.update({ where: { id: existing.id }, data: { status: "accepted", acceptedAt: new Date() } })
    : await prisma.friendship.create({
        data: { requesterId: owner.id, addresseeId: userId, status: "accepted", source: "invite", acceptedAt: new Date() },
      });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, faceitNickname: true } });
  await notifyFriend(prisma, { userId: owner.id, type: "FRIEND_ACCEPTED", name: me?.name || me?.faceitNickname || "" });
  return NextResponse.json({ id: row.id, status: "accepted" });
}
