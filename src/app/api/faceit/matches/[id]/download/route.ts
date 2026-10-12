import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { limitReachedMessage, withUploadSlots } from "@/lib/limits";
import {
  activeUploadId,
  createFaceitUpload,
  faceitDownloadsEnabled,
  FACEIT_UPLOAD_INCLUDE,
  queueFaceitDownload,
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
  // being retried isn't counted (it's excluded from the tally). Counting,
  // re-checking the match and creating the row are one step per user, so
  // parallel requests can't share the last slot or both claim the match.
  const result = await withUploadSlots(userId, async (tx, usage) => {
    if (!usage.allowed) return { error: limitReachedMessage(usage) } as const;
    const fm = await tx.faceitMatch.findUnique({ where: { id }, include: FACEIT_UPLOAD_INCLUDE });
    if (!fm) return { error: "Not found", status: 404 } as const;
    const active = activeUploadId(fm);
    if (active) return { existing: active } as const;
    return { uploadId: await createFaceitUpload(tx, userId, fm) } as const;
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: "status" in result ? result.status : 403 });
  }
  if ("existing" in result) {
    return NextResponse.json({ uploadId: result.existing }, { status: 200 });
  }

  await queueFaceitDownload(result.uploadId, faceitMatch.faceitMatchId, userId);
  return NextResponse.json({ uploadId: result.uploadId }, { status: 201 });
}
