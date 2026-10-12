import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { keepDemoSlotsLeft, limitReachedMessage, withUploadSlots } from "@/lib/limits";
import {
  activeSteamUploadId,
  createSteamUpload,
  queueSteamDownload,
  STEAM_UPLOAD_INCLUDE,
} from "@/lib/steam/premier";
import { rateLimit } from "@/lib/security/rate-limit-http";

/**
 * POST /api/steam/matches/[id]/analyze — the player asked to analyze this
 * Premier match: download its replay link and queue the analysis. Without a
 * replay link the UI sends the player to /upload?steam=<id> instead.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("analyze", session.user.id);
  if (limited) return limited;
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

  // Count, re-check the match and create the upload as one step per user, so
  // parallel requests can't share the last slot or both claim the match.
  const result = await withUploadSlots(userId, async (tx, usage) => {
    if (!usage.allowed) return { error: limitReachedMessage(usage) } as const;
    const fresh = await tx.steamMatch.findUnique({ where: { id }, include: STEAM_UPLOAD_INCLUDE });
    if (!fresh) return { error: "Not found", status: 404 } as const;
    const activeNow = activeSteamUploadId(fresh);
    if (activeNow) return { existing: activeNow } as const;
    // Over the plan's "keep demo" cap the analysis still runs, without keeping the .dem.
    const keepDemo = body.keepDemo === true && keepDemoSlotsLeft(usage) > 0;
    return { uploadId: await createSteamUpload(tx, userId, fresh, keepDemo) } as const;
  });
  if ("error" in result) {
    return "status" in result
      ? NextResponse.json({ error: result.error }, { status: result.status })
      : NextResponse.json({ error: result.error, code: "limit" }, { status: 403 });
  }
  if ("existing" in result) return NextResponse.json({ uploadId: result.existing });

  await queueSteamDownload(result.uploadId, sm.id, userId);
  return NextResponse.json({ uploadId: result.uploadId }, { status: 201 });
}
