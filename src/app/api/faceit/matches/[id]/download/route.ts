import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { checkMonthlyDemoLimit, limitReachedMessage } from "@/lib/limits";
import {
  activeUploadId,
  enqueueFaceitDownload,
  faceitDownloadsEnabled,
  FACEIT_UPLOAD_INCLUDE,
} from "@/lib/faceit/analyze";

/**
 * POST /api/faceit/matches/[id]/download
 *
 * Enqueue a FACEIT demo download + analysis for the given FaceitMatch
 * (id = FaceitMatch.id). Returns { uploadId } for the upload status polling
 * UI. Without the Downloads API, answers 409 { uploadUrl } so the UI can send
 * the player to the upload page instead.
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
    include: FACEIT_UPLOAD_INCLUDE,
  });

  // Ownership check
  if (!faceitMatch || faceitMatch.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already downloaded / in-flight — return the existing upload for polling
  // instead of creating a duplicate.
  const existing = activeUploadId(faceitMatch);
  if (existing) {
    return NextResponse.json({ uploadId: existing }, { status: 200 });
  }

  if (!faceitDownloadsEnabled()) {
    return NextResponse.json(
      {
        error: "Automatic FACEIT downloads are not available yet. Download the demo from the FACEIT match room and upload it.",
        uploadUrl: `/upload?faceit=${faceitMatch.id}`,
      },
      { status: 409 }
    );
  }

  // Enforce the monthly demo limit (same as manual upload). A FAILED upload
  // being retried isn't counted (it's excluded from the tally).
  const limit = await checkMonthlyDemoLimit(userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: limitReachedMessage(limit) }, { status: 403 });
  }

  const uploadId = await enqueueFaceitDownload(userId, faceitMatch);
  return NextResponse.json({ uploadId }, { status: 201 });
}
