import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { checkMonthlyDemoLimit } from "@/lib/limits";
import {
  faceitDemoDownloadQueue,
  FACEIT_DOWNLOAD_JOB_OPTS,
} from "@/lib/queue";

/**
 * POST /api/faceit/matches/[id]/download
 *
 * Enqueue an automated FACEIT demo download + analysis for the given
 * FaceitMatch (id = FaceitMatch.id). Returns { uploadId } for the existing
 * upload status polling UI.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const faceitMatch = await prisma.faceitMatch.findUnique({
    where: { id },
    include: { upload: { select: { id: true, status: true } } },
  });

  // Ownership check
  if (!faceitMatch || faceitMatch.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already downloaded / in-flight — return the existing upload for polling
  // instead of creating a duplicate. A prior FAILED upload is reused below.
  const existing = faceitMatch.upload;
  if (existing && existing.status !== "FAILED") {
    return NextResponse.json({ uploadId: existing.id }, { status: 200 });
  }

  // Enforce the monthly demo limit (same as manual upload). A FAILED upload
  // being retried isn't counted (it's excluded from the tally), so a retry
  // right at the limit is still allowed to re-run.
  const limit = await checkMonthlyDemoLimit(userId);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Monthly demo limit reached (${limit.used}/${limit.limit} on ${limit.plan} plan). Upgrade for more.`,
      },
      { status: 403 }
    );
  }

  // Reuse a prior FAILED upload (its unique faceitMatchId would otherwise
  // collide) or create a fresh one, then link it to the match.
  let upload: { id: string };
  if (existing) {
    upload = await prisma.demoUpload.update({
      where: { id: existing.id },
      data: { status: "QUEUED", error: null, matchId: null },
      select: { id: true },
    });
  } else {
    upload = await prisma.demoUpload.create({
      data: {
        userId,
        fileName: `${faceitMatch.faceitMatchId}.dem`,
        fileSize: 0,
        fileUrl: "",
        status: "QUEUED",
        source: "FACEIT",
        faceitMatchId: faceitMatch.faceitMatchId,
      },
      select: { id: true },
    });
    await prisma.faceitMatch.update({
      where: { id: faceitMatch.id },
      data: { uploadId: upload.id },
    });
  }

  await faceitDemoDownloadQueue.add(
    "download",
    {
      uploadId: upload.id,
      faceitMatchId: faceitMatch.faceitMatchId,
      userId,
    },
    FACEIT_DOWNLOAD_JOB_OPTS
  );

  console.log(
    `[faceit-download] queued uploadId=${upload.id} faceitMatchId=${faceitMatch.faceitMatchId}`
  );

  return NextResponse.json({ uploadId: upload.id }, { status: 201 });
}
