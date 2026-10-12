import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { demoParseQueue } from "@/lib/queue";
import { checkMonthlyDemoLimit, limitReachedMessage } from "@/lib/limits";
import {
  enqueueFaceitDownload,
  faceitDownloadsEnabled,
  FACEIT_UPLOAD_INCLUDE,
} from "@/lib/faceit/analyze";
import { enqueueSteamDownload, STEAM_UPLOAD_INCLUDE } from "@/lib/steam/premier";

/**
 * POST /api/uploads/[id]/retry — run a failed analysis again: re-parse the
 * stored demo, or re-download it from FACEIT. Returns { uploadId } (a new id
 * for a FACEIT re-download).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;

  const upload = await prisma.demoUpload.findUnique({ where: { id } });
  if (!upload || upload.userId !== userId || upload.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (upload.status !== "FAILED") {
    return NextResponse.json({ error: "Only failed analyses can be retried" }, { status: 409 });
  }

  // A failed upload isn't counted; running it again is.
  const limit = await checkMonthlyDemoLimit(userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: limitReachedMessage(limit) }, { status: 403 });
  }

  if (upload.fileUrl && !upload.demoDeletedAt) {
    await prisma.demoUpload.update({
      where: { id },
      data: { status: "QUEUED", error: null, progress: 0 },
    });
    await demoParseQueue.add("parse", { uploadId: id, filePath: upload.fileUrl, userId });
    return NextResponse.json({ uploadId: id });
  }

  if (upload.faceitMatchId && faceitDownloadsEnabled()) {
    const fm = await prisma.faceitMatch.findUnique({
      where: { faceitMatchId: upload.faceitMatchId },
      include: FACEIT_UPLOAD_INCLUDE,
    });
    if (fm && fm.userId === userId) {
      const uploadId = await enqueueFaceitDownload(userId, fm, upload.keepDemo);
      return NextResponse.json({ uploadId });
    }
  }

  const sm = await prisma.steamMatch.findUnique({
    where: { uploadId: id },
    include: STEAM_UPLOAD_INCLUDE,
  });
  if (sm && sm.userId === userId && sm.demoUrl) {
    const uploadId = await enqueueSteamDownload(userId, sm, upload.keepDemo);
    await prisma.demoUpload.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ uploadId });
  }

  return NextResponse.json(
    { error: "The demo file is gone. Upload it again to retry." },
    { status: 409 }
  );
}
