import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { sharePath } from "@/lib/sharing/share";
import { newShareToken } from "@/lib/sharing/token";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { clipShareSchema } from "@/lib/clips/clip";
import { isFindingType } from "@/lib/findings/catalog";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report"), matchId: z.string().min(1), steamId: z.string().min(1) }),
  z.object({
    kind: z.literal("moment"),
    matchId: z.string().min(1),
    steamId: z.string().min(1).nullable().optional(),
    round: z.number().int().min(1),
    tick: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("clip"),
    matchId: z.string().min(1),
    steamId: z.string().min(1),
    round: z.number().int().min(1),
    clip: clipShareSchema,
  }),
]);

/** A clip may start this long before its round and end this long after it. */
const CLIP_SLACK_TICKS = 5 * 64;

/**
 * POST /api/shares — a public link to one player's report of the user's match,
 * to one moment of its replay, or to a 2D clip (a highlight or a mistake,
 * S25). Sharing the same report or clip twice returns the live link instead
 * of a new one.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const userId = session.user.id;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const data = body.data;

  const match = await prisma.match.findFirst({
    where: { id: data.matchId, upload: { userId, deletedAt: null } },
    select: {
      id: true,
      players: { select: { steamId: true } },
      rounds: { select: { number: true, startTick: true, endTick: true } },
    },
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

  const round = match.rounds.find((r) => r.number === data.round);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 400 });
  }

  if (data.kind === "clip") {
    const c = data.clip;
    if (c.from < round.startTick - CLIP_SLACK_TICKS || c.to > round.endTick + CLIP_SLACK_TICKS) {
      return NextResponse.json({ error: "Clip outside round" }, { status: 400 });
    }
    if (c.kind === "finding" && (!c.findingType || !isFindingType(c.findingType))) {
      return NextResponse.json({ error: "Unknown finding type" }, { status: 400 });
    }
    if (c.target && !match.players.some((p) => p.steamId === c.target)) {
      return NextResponse.json({ error: "Player not in match" }, { status: 400 });
    }
    const live = await prisma.share.findFirst({
      where: { userId, matchId: match.id, kind: "clip", steamId, roundNumber: data.round, tick: c.focus, revokedAt: null },
    });
    if (live) return NextResponse.json({ token: live.token, path: sharePath(live.token) });
    const share = await prisma.share.create({
      data: {
        token: newShareToken(),
        userId,
        matchId: match.id,
        kind: "clip",
        steamId,
        roundNumber: data.round,
        tick: c.focus,
        clip: c,
      },
    });
    return NextResponse.json({ token: share.token, path: sharePath(share.token) });
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
