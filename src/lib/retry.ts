/**
 * Running a failed (or stuck) analysis again. Shared by the player's own
 * retry button (`/api/uploads/[id]/retry`) and the admin panel
 * (`/api/admin/uploads/[id]/retry`), which differ only in who may call it and
 * whether the monthly limit applies.
 */
import type { DemoUpload } from "@prisma/client";
import { demoParseQueue } from "@/lib/queue";
import { limitReachedMessage, withUploadSlots } from "@/lib/limits";
import {
  createFaceitUpload,
  faceitDownloadsEnabled,
  FACEIT_UPLOAD_INCLUDE,
  queueFaceitDownload,
} from "@/lib/faceit/analyze";
import { createSteamUpload, queueSteamDownload, STEAM_UPLOAD_INCLUDE } from "@/lib/steam/premier";

export type RetryResult =
  | { ok: true; uploadId: string }
  | { ok: false; status: number; error: string };

export interface RetryOptions {
  /** Count the re-run against the owner's monthly limit (players: yes, admins: no). */
  enforceLimit: boolean;
}

type RetryPlan =
  | { ok: false; status: number; error: string }
  | { ok: true; kind: "parse"; uploadId: string; filePath: string }
  | { ok: true; kind: "faceit"; uploadId: string; faceitMatchId: string }
  | { ok: true; kind: "steam"; uploadId: string; steamMatchId: string };

/**
 * Re-parse the stored demo, or re-download it from FACEIT or Steam. The caller
 * checks that the upload may be retried (FAILED, or stuck for admins, who mark
 * it FAILED first). Returns the upload id that now carries the analysis (a new
 * one for a FACEIT or Steam re-download).
 *
 * The limit check and the claim of the failed row run under the per-user
 * upload lock (`withUploadSlots`) and re-read the row there: parallel retries
 * (a double click, or one request per failed upload) could otherwise all pass
 * the limit with one slot left, or queue the same upload twice / create
 * several FACEIT or Steam re-downloads of one match.
 */
export async function retryUpload(upload: DemoUpload, { enforceLimit }: RetryOptions): Promise<RetryResult> {
  const userId = upload.userId;

  const plan = await withUploadSlots<RetryPlan>(userId, async (tx, usage) => {
    const current = await tx.demoUpload.findUnique({ where: { id: upload.id } });
    if (!current || current.deletedAt || current.status !== "FAILED") {
      return { ok: false, status: 409, error: "This analysis is already being retried." };
    }
    // A failed upload isn't counted; running it again is.
    if (enforceLimit && !usage.allowed) return { ok: false, status: 403, error: limitReachedMessage(usage) };

    if (current.fileUrl && !current.demoDeletedAt) {
      await tx.demoUpload.update({
        where: { id: current.id },
        data: { status: "QUEUED", error: null, progress: 0, retries: { increment: 1 } },
      });
      return { ok: true, kind: "parse", uploadId: current.id, filePath: current.fileUrl };
    }

    if (current.faceitMatchId && faceitDownloadsEnabled()) {
      const fm = await tx.faceitMatch.findUnique({
        where: { userId_faceitMatchId: { userId, faceitMatchId: current.faceitMatchId } },
        include: FACEIT_UPLOAD_INCLUDE,
      });
      if (fm && fm.userId === userId) {
        const uploadId = await createFaceitUpload(tx, userId, fm, current.keepDemo);
        return { ok: true, kind: "faceit", uploadId, faceitMatchId: fm.faceitMatchId };
      }
    }

    // Premier / Steam match: download it again from Valve's replay server.
    const sm = await tx.steamMatch.findUnique({
      where: { uploadId: current.id },
      include: STEAM_UPLOAD_INCLUDE,
    });
    if (sm && sm.userId === userId && sm.demoUrl) {
      const uploadId = await createSteamUpload(tx, userId, sm, current.keepDemo);
      await tx.demoUpload.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
      return { ok: true, kind: "steam", uploadId, steamMatchId: sm.id };
    }

    return { ok: false, status: 409, error: "The demo file is gone. Upload it again to retry." };
  });

  if (!plan.ok) return plan;
  // Jobs are queued once the rows are committed, outside the lock.
  if (plan.kind === "parse") {
    await demoParseQueue.add("parse", { uploadId: plan.uploadId, filePath: plan.filePath, userId });
  } else if (plan.kind === "faceit") {
    await queueFaceitDownload(plan.uploadId, plan.faceitMatchId, userId);
  } else {
    await queueSteamDownload(plan.uploadId, plan.steamMatchId, userId);
  }
  return { ok: true, uploadId: plan.uploadId };
}
