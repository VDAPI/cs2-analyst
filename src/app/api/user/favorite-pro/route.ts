import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/user/favorite-pro — remember the pro player "play like a pro"
 * (S24) compares with. `steamId` must be a player in the pro pool; null clears it.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { steamId?: unknown };
  const steamId = body.steamId;
  if (steamId !== null && (typeof steamId !== "string" || !/^\d{1,20}$/.test(steamId))) {
    return NextResponse.json({ error: "Invalid steamId" }, { status: 400 });
  }
  if (steamId) {
    const inPool = await prisma.normSample.findFirst({ where: { steamId, pro: true }, select: { id: true } });
    if (!inPool) return NextResponse.json({ error: "Not a pro pool player" }, { status: 404 });
  }
  await prisma.user.update({ where: { id: session.user.id }, data: { favoriteProSteamId: steamId } });
  return NextResponse.json({ steamId });
}
