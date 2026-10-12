/**
 * Running a failed (or stuck) analysis again. Shared by the player's own
 * retry button (`/api/uploads/[id]/retry`) and the admin panel
 * (`/api/admin/uploads/[id]/retry`), which differ only in who may call it and
 * whether the monthly limit applies.
 */
import type { DemoUpload } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { demoParseQueue } from "@/lib/queue";
import { checkMonthlyDemoLimit, limitReachedMessage } from "@/lib/limits";
import {
  enqueueFaceitDownload,
  faceitDownloadsEnabled,
  FACEIT_UPLOAD_INCLUDE,
} from "@/lib/faceit/analyze";

export type RetryResult =
  | { ok: true; uploadId: string }
  | { ok: false; status: number; error: string };

export interface RetryOptions {
  /** Count the re-run against the owner's monthly limit (players: yes, admins: no). */
  enforceLimit: boolean;
}

/**
 * Re-parse the stored demo, or re-download it from FACEIT. The caller checks
 * that the upload may be retried (FAILED, or stuck for admins). Returns the
 * upload id that now carries the analysis (a new one for a FACEIT re-download).
 */
export async function retryUpload(upload: DemoUpload, { enforceLimit }: RetryOptions): Promise<RetryResult> {
  const userId = upload.userId;

  if (enforceLimit) {
    // A failed upload isn't counted; running it again is.
    const limit = await checkMonthlyDemoLimit(userId);
    if (!limit.allowed) return { ok: false, status: 403, error: limitReachedMessage(limit) };
  }

  if (upload.fileUrl && !upload.demoDeletedAt) {
    await prisma.demoUpload.update({
      where: { id: upload.id },
      data: { status: "QUEUED", error: null, progress: 0, retries: { increment: 1 } },
    });
    await demoParseQueue.add("parse", { uploadId: upload.id, filePath: upload.fileUrl, userId });
    return { ok: true, uploadId: upload.id };
  }

  if (upload.faceitMatchId && faceitDownloadsEnabled()) {
    const fm = await prisma.faceitMatch.findUnique({
      where: { faceitMatchId: upload.faceitMatchId },
      include: FACEIT_UPLOAD_INCLUDE,
    });
    if (fm && fm.userId === userId) {
      const uploadId = await enqueueFaceitDownload(userId, fm, upload.keepDemo);
      return { ok: true, uploadId };
    }
  }

  return { ok: false, status: 409, error: "The demo file is gone. Upload it again to retry." };
}
