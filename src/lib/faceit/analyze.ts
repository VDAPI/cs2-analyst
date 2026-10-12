/**
 * Queue FACEIT matches the player picked for download + analysis.
 *
 * Downloads only ever start from an explicit pick (single button or
 * "Analyze selected"), never automatically in the background. When the
 * Downloads API isn't configured, the UI sends the player to the upload page
 * with a "download the demo from FACEIT" hint instead.
 */
import type { FaceitMatch, Prisma } from "@prisma/client";
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
export async function releaseFaceitMatch(
  faceitMatchId: string,
  db: Prisma.TransactionClient = prisma
): Promise<void> {
  await db.demoUpload.updateMany({
    where: { faceitMatchId, OR: [{ status: "FAILED" }, { deletedAt: { not: null } }] },
    data: { faceitMatchId: null, deletedAt: new Date() },
  });
  await db.faceitMatch.update({
    where: { faceitMatchId },
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
  const uploadId = await createFaceitUpload(prisma, userId, fm, keepDemo);
  await queueFaceitDownload(uploadId, fm.faceitMatchId, userId);
  return uploadId;
}

/**
 * The row half of enqueueFaceitDownload: release a failed/deleted upload,
 * create the new one and link it to the match. Takes the transaction of
 * withUploadSlots(); queue the job with queueFaceitDownload once it commits.
 */
export async function createFaceitUpload(
  db: Prisma.TransactionClient,
  userId: string,
  fm: FaceitMatchWithUpload,
  keepDemo = false
): Promise<string> {
  if (fm.upload) await releaseFaceitMatch(fm.faceitMatchId, db);

  const upload = await db.demoUpload.create({
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
  await db.faceitMatch.update({
    where: { id: fm.id },
    data: { uploadId: upload.id },
  });
  return upload.id;
}

/** Queue the download of an upload made by createFaceitUpload. */
export async function queueFaceitDownload(
  uploadId: string,
  faceitMatchId: string,
  userId: string
): Promise<void> {
  await faceitDemoDownloadQueue.add(
    "download",
    { uploadId, faceitMatchId, userId },
    FACEIT_DOWNLOAD_JOB_OPTS
  );
  console.log(`[faceit-download] queued uploadId=${uploadId} faceitMatchId=${faceitMatchId}`);
}

export const FACEIT_UPLOAD_INCLUDE = {
  upload: { select: { id: true, status: true, deletedAt: true } },
} as const;
