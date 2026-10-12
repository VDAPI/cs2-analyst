import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { sharePath } from "@/lib/sharing/share";
import { newShareToken } from "@/lib/sharing/token";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report"), matchId: z.string().min(1), steamId: z.string().min(1) }),
  z.object({
    kind: z.literal("moment"),
    matchId: z.string().min(1),
    steamId: z.string().min(1).nullable().optional(),
    round: z.number().int().min(1),
    tick: z.number().int().min(0),
  }),
]);

/**
 * POST /api/shares — a public link to one player's report of the user's match,
 * or to one moment of its replay. Sharing the same report twice returns the
 * live link instead of a new one.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = body.data;

  const match = await prisma.match.findFirst({
    where: { id: data.matchId, upload: { userId, deletedAt: null } },
    select: { id: true, players: { select: { steamId: true } }, rounds: { select: { number: true } } },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const steamId = data.steamId ?? null;
  if (steamId && !match.players.some((p) => p.steamId === steamId)) {
    return NextResponse.json({ error: "Player not in match" }, { status: 400 });
  }

  if (data.kind === "report") {
    const live = await prisma.share.findFirst({
      where: { userId, matchId: match.id, kind: "report", steamId, revokedAt: null },
    });
    if (live) return NextResponse.json({ token: live.token, path: sharePath(live.token) });
    const share = await prisma.share.create({
      data: { token: newShareToken(), userId, matchId: match.id, kind: "report", steamId },
    });
    return NextResponse.json({ token: share.token, path: sharePath(share.token) });
  }

  if (!match.rounds.some((r) => r.number === data.round)) {
    return NextResponse.json({ error: "Round not found" }, { status: 400 });
  }
  const share = await prisma.share.create({
    data: {
      token: newShareToken(),
      userId,
      matchId: match.id,
      kind: "moment",
      steamId,
      roundNumber: data.round,
      tick: data.tick,
    },
  });
  return NextResponse.json({ token: share.token, path: sharePath(share.token) });
}
