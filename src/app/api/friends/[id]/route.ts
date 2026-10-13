import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { countFriends } from "@/lib/friends/load";
import { MAX_FRIENDS } from "@/lib/friends/ranking";
import { notifyFriend } from "@/lib/notifications/notify";

interface Ctx {
  params: Promise<{ id: string }>;
}

const schema = z.object({ action: z.enum(["accept"]) });

/** PATCH /api/friends/[id] — accept a request sent to the user. */
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("write", userId);
  if (limited) return limited;
  const { id } = await params;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const row = await prisma.friendship.findFirst({ where: { id, addresseeId: userId, status: "pending" } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [mine, theirs] = await Promise.all([countFriends(prisma, userId), countFriends(prisma, row.requesterId)]);
  if (mine >= MAX_FRIENDS || theirs >= MAX_FRIENDS) {
    return NextResponse.json({ error: "Friend limit", max: MAX_FRIENDS }, { status: 409 });
  }
  await prisma.friendship.update({ where: { id }, data: { status: "accepted", acceptedAt: new Date() } });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, faceitNickname: true } });
  await notifyFriend(prisma, { userId: row.requesterId, type: "FRIEND_ACCEPTED", name: me?.name || me?.faceitNickname || "" });
  return NextResponse.json({ id, status: "accepted" });
}

/** DELETE /api/friends/[id] — remove a friend, decline a request or cancel one the user sent. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("write", userId);
  if (limited) return limited;
  const { id } = await params;

  const { count } = await prisma.friendship.deleteMany({
    where: { id, OR: [{ requesterId: userId }, { addresseeId: userId }] },
  });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
