/**
 * Premier / Steam matches the player added (S18): shared helpers for the
 * routes and the upload page. Mirrors src/lib/faceit/analyze.ts.
 */
import type { Prisma, SteamMatch } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { steamDemoDownloadQueue, STEAM_DOWNLOAD_JOB_OPTS } from "@/lib/queue";

export const STEAM_UPLOAD_INCLUDE = {
  upload: { select: { id: true, status: true, deletedAt: true, matchId: true } },
} as const;

type SteamMatchWithUpload = SteamMatch & {
  upload: { id: string; status: string; deletedAt: Date | null } | null;
};

/** The upload that already covers this match, unless it failed or was deleted. */
export function activeSteamUploadId(sm: SteamMatchWithUpload): string | null {
  const u = sm.upload;
  if (!u || u.status === "FAILED" || u.deletedAt) return null;
  return u.id;
}

/** Detach a failed / deleted upload so the match can be analyzed again. */
export async function releaseSteamMatch(
  steamMatchId: string,
  db: Prisma.TransactionClient = prisma
): Promise<void> {
  await db.steamMatch.update({ where: { id: steamMatchId }, data: { uploadId: null } });
}

/** Creates the upload and queues the replay download. Caller checked ownership and limits. */
export async function enqueueSteamDownload(
  userId: string,
  sm: SteamMatchWithUpload,
  keepDemo = false
): Promise<string> {
  const uploadId = await createSteamUpload(prisma, userId, sm, keepDemo);
  await queueSteamDownload(uploadId, sm.id, userId);
  return uploadId;
}

/**
 * The row half of enqueueSteamDownload: release a failed/deleted upload,
 * create the new one and link it to the match. Takes the transaction of
 * withUploadSlots(); queue the job with queueSteamDownload once it commits.
 */
export async function createSteamUpload(
  db: Prisma.TransactionClient,
  userId: string,
  sm: SteamMatchWithUpload,
  keepDemo = false
): Promise<string> {
  if (sm.upload) await releaseSteamMatch(sm.id, db);
  const upload = await db.demoUpload.create({
    data: {
      userId,
      fileName: `premier-${sm.matchId}.dem`,
      fileSize: 0,
      fileUrl: "",
      status: "QUEUED",
      source: "STEAM",
      keepDemo,
    },
    select: { id: true },
  });
  await db.steamMatch.update({ where: { id: sm.id }, data: { uploadId: upload.id } });
  return upload.id;
}

/** Queue the download of an upload made by createSteamUpload. */
export async function queueSteamDownload(uploadId: string, steamMatchId: string, userId: string): Promise<void> {
  await steamDemoDownloadQueue.add("download", { uploadId, steamMatchId, userId }, STEAM_DOWNLOAD_JOB_OPTS);
}
