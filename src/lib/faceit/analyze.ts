/**
 * Queue FACEIT matches the player picked for download + analysis.
 *
 * Downloads only ever start from an explicit pick (single button or
 * "Analyze selected"), never automatically in the background. When the
 * Downloads API isn't configured, the UI sends the player to the upload page
 * with a "download the demo from FACEIT" hint instead.
 */
import type { FaceitMatch } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { faceitDemoDownloadQueue, FACEIT_DOWNLOAD_JOB_OPTS } from "@/lib/queue";

/** True when the server can fetch FACEIT demos itself (Downloads API key set). */
export function faceitDownloadsEnabled(): boolean {
  return Boolean(process.env.FACEIT_DOWNLOADS_API_KEY);
}

type FaceitMatchWithUpload = FaceitMatch & {
  upload: { id: string; status: string; deletedAt: Date | null } | null;
};

/**
 * The upload that already covers this match (in flight or analyzed), if any.
 * Failed and deleted uploads don't count — the match can be analyzed again.
 */
export function activeUploadId(fm: FaceitMatchWithUpload): string | null {
  const u = fm.upload;
  if (!u || u.status === "FAILED" || u.deletedAt) return null;
  return u.id;
}

/**
 * Detach a failed or deleted upload from its FACEIT match so a new upload can
 * take the (unique) faceitMatchId. A failed one also leaves the queue screen,
 * since the retry replaces it.
 */
export async function releaseFaceitMatch(userId: string, faceitMatchId: string): Promise<void> {
  await prisma.demoUpload.updateMany({
    where: { userId, faceitMatchId, OR: [{ status: "FAILED" }, { deletedAt: { not: null } }] },
    data: { faceitMatchId: null, deletedAt: new Date() },
  });
  await prisma.faceitMatch.update({
    where: { userId_faceitMatchId: { userId, faceitMatchId } },
    data: { uploadId: null },
  });
}

/**
 * Create a FACEIT upload and queue its download. The caller has already
 * checked ownership, the plan limit and that no active upload exists.
 */
export async function enqueueFaceitDownload(
  userId: string,
  fm: FaceitMatchWithUpload,
  keepDemo = false
): Promise<string> {
  if (fm.upload) await releaseFaceitMatch(userId, fm.faceitMatchId);

  const upload = await prisma.demoUpload.create({
    data: {
      userId,
      fileName: `${fm.faceitMatchId}.dem`,
      fileSize: 0,
      fileUrl: "",
      status: "QUEUED",
      source: "FACEIT",
      faceitMatchId: fm.faceitMatchId,
      keepDemo,
    },
    select: { id: true },
  });
  await prisma.faceitMatch.update({
    where: { id: fm.id },
    data: { uploadId: upload.id },
  });

  await faceitDemoDownloadQueue.add(
    "download",
    { uploadId: upload.id, faceitMatchId: fm.faceitMatchId, userId },
    FACEIT_DOWNLOAD_JOB_OPTS
  );
  console.log(
    `[faceit-download] queued uploadId=${upload.id} faceitMatchId=${fm.faceitMatchId}`
  );
  return upload.id;
}

export const FACEIT_UPLOAD_INCLUDE = {
  upload: { select: { id: true, status: true, deletedAt: true } },
} as const;
