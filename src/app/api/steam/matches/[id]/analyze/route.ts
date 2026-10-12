import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { checkMonthlyDemoLimit, limitReachedMessage } from "@/lib/limits";
import { activeSteamUploadId, enqueueSteamDownload, STEAM_UPLOAD_INCLUDE } from "@/lib/steam/premier";

/**
 * POST /api/steam/matches/[id]/analyze — the player asked to analyze this
 * Premier match: download its replay link and queue the analysis. Without a
 * replay link the UI sends the player to /upload?steam=<id> instead.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { keepDemo?: unknown };

  const sm = await prisma.steamMatch.findUnique({ where: { id }, include: STEAM_UPLOAD_INCLUDE });
  if (!sm || sm.userId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sm.demoUrl) {
    return NextResponse.json({ error: "No replay link", code: "no_replay_url" }, { status: 409 });
  }
  const active = activeSteamUploadId(sm);
  if (active) return NextResponse.json({ uploadId: active });

  const limit = await checkMonthlyDemoLimit(userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: limitReachedMessage(limit), code: "limit" }, { status: 403 });
  }

  const uploadId = await enqueueSteamDownload(userId, sm, body.keepDemo === true);
  return NextResponse.json({ uploadId }, { status: 201 });
}
