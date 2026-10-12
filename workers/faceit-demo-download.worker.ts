/**
 * FACEIT Demo Download Worker
 *
 * Runs as a separate process via `npm run worker:faceit`.
 * Listens to the "faceit-demo-download" BullMQ queue: exchanges a FACEIT
 * demo resource URL for a short-lived signed S3 URL, streams + decompresses
 * the zstd demo to a temp file, then parses + persists it inline through the
 * shared pipeline (driving DemoUpload QUEUED → PARSING → COMPLETED/FAILED).
 *
 * concurrency: 1 — demo downloads are processed sequentially so signed URLs
 * are never exchanged in parallel (gateway rate limit 20 req/s).
 */
import { Worker, UnrecoverableError, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSignedDemoUrl,
  downloadAndDecompressDemo,
  DemoNotReadyError,
} from "../src/lib/faceit/downloads";
import { refreshDemoResource } from "../src/lib/faceit/sync";
import { parseAndPersistDemo } from "../src/lib/parsers/persist-demo";
import {
  demoRetention,
  shouldDeleteDemo,
  storeDemoFile,
} from "../src/lib/storage/demo-store";
import { deleteAnalysis } from "../src/lib/library";
import type { FaceitDemoDownloadJobData } from "../src/lib/queue";
import { notifyUploadFinished } from "../src/lib/notifications/notify";
import { initWorkerSentry, reportJobFailure } from "../src/lib/monitoring/worker-sentry";

initWorkerSentry("worker-faceit");

const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function processDownload(job: Job<FaceitDemoDownloadJobData>) {
  const { uploadId, faceitMatchId, userId } = job.data;
  console.log(
    `[faceit-download] start uploadId=${uploadId} faceitMatchId=${faceitMatchId}`
  );

  const destPath = join(tmpdir(), `${uploadId}.dem`);

  try {
    // Cancelled from the queue screen before we got to it.
    const upload = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { deletedAt: true },
    });
    if (!upload || upload.deletedAt) {
      console.log(`[faceit-download] skip uploadId=${uploadId}: removed by the user`);
      return null;
    }
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "DOWNLOADING", error: null },
    });

    const faceitMatch = await prisma.faceitMatch.findUnique({
      where: { userId_faceitMatchId: { userId, faceitMatchId } },
    });
    if (!faceitMatch || faceitMatch.userId !== userId) {
      // Nothing to retry — the match is gone or not owned by this user.
      await failUpload(uploadId, "FACEIT match not found");
      throw new UnrecoverableError("FACEIT match not found");
    }

    // 1. Resolve the demo resource URL — re-fetch from the Data API if we
    //    don't have one yet (fresh matches may not expose a demo initially).
    let resourceUrl = faceitMatch.demoResourceUrl;
    if (!resourceUrl) {
      const refreshed = await refreshDemoResource(faceitMatchId);
      resourceUrl = refreshed.demoResourceUrl;
    }
    if (!resourceUrl) {
      await prisma.faceitMatch.update({
        where: { userId_faceitMatchId: { userId, faceitMatchId } },
        data: { demoStatus: "NOT_READY" },
      });
      // Retryable — demo may become available on a later attempt.
      throw new DemoNotReadyError("Demo resource URL not yet available");
    }

    // 2. Exchange for a short-lived signed URL and stream + decompress.
    //    Exchange immediately before download — never persist the signed URL.
    const signedUrl = await getSignedDemoUrl(resourceUrl);
    await downloadAndDecompressDemo(signedUrl, destPath);
    const { size } = await stat(destPath);
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { fileSize: size },
    });

    // 3. Parse + persist inline (drives the DemoUpload status machine).
    const result = await parseAndPersistDemo(
      prisma,
      { uploadId, filePath: destPath },
      (pct) => job.updateProgress(pct)
    );

    await prisma.faceitMatch.update({
      where: { userId_faceitMatchId: { userId, faceitMatchId } },
      data: { demoStatus: "DOWNLOADED" },
    });

    // 4. Keep the .dem only for "keep demo", or when the replay data failed
    //    to store (so the replay can fall back to the file and
    //    `npm run backfill:replay` can retry it). Otherwise it goes now.
    const after = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { keepDemo: true, deletedAt: true },
    });
    if (after?.deletedAt) {
      await deleteAnalysis(prisma, uploadId);
    } else if (
      shouldDeleteDemo({
        replayStored: result.replayStored,
        keepDemo: after?.keepDemo ?? false,
        retention: demoRetention(),
      })
    ) {
      await prisma.demoUpload.update({
        where: { id: uploadId },
        data: { demoDeletedAt: new Date() },
      });
    } else {
      try {
        const fileUrl = await storeDemoFile(uploadId, destPath);
        await prisma.demoUpload.update({ where: { id: uploadId }, data: { fileUrl } });
      } catch (storeErr) {
        // The analysis itself succeeded; only the copy of the .dem is lost.
        console.error(`[faceit-download] storing demo failed uploadId=${uploadId}`, storeErr);
        await prisma.demoUpload.update({
          where: { id: uploadId },
          data: { demoDeletedAt: new Date() },
        });
      }
    }

    console.log(
      `[faceit-download] done uploadId=${uploadId} matchId=${result.matchId}`
    );
    return result;
  } catch (err) {
    // Permanent failure only once retries are exhausted (or unrecoverable).
    const isLastAttempt =
      err instanceof UnrecoverableError ||
      job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (err instanceof DemoNotReadyError) {
      console.log(
        `[faceit-download] not ready uploadId=${uploadId}: ${err.message} (attempt ${job.attemptsMade + 1})`
      );
    }
    if (isLastAttempt) {
      await failUpload(uploadId, err instanceof Error ? err.message : "Unknown error");
      await prisma.faceitMatch
        .update({
          where: { userId_faceitMatchId: { userId, faceitMatchId } },
          data: { demoStatus: "FAILED" },
        })
        .catch(() => {});
    } else {
      // Back to QUEUED so the UI keeps polling; rethrow to retry.
      await requeueUpload(
        uploadId,
        err instanceof DemoNotReadyError
          ? "Demo not ready on FACEIT yet, retrying"
          : `${err instanceof Error ? err.message : "Unknown error"} (retrying)`
      );
    }
    throw err;
  } finally {
    // Clean up the decompressed .dem from temp (the .zst is removed
    // inside downloadAndDecompressDemo). A kept demo was moved out already.
    await unlink(destPath).catch(() => {});
  }
}

async function requeueUpload(uploadId: string, note: string) {
  await prisma.demoUpload
    .update({
      where: { id: uploadId },
      data: { status: "QUEUED", error: note },
    })
    .catch(() => {});
}

async function failUpload(uploadId: string, message: string) {
  await prisma.demoUpload
    .update({
      where: { id: uploadId },
      data: { status: "FAILED", error: message },
    })
    .catch(() => {});
}

// ─── Start Worker ────────────────────────────────────────

const worker = new Worker("faceit-demo-download", processDownload, {
  connection: { url: REDIS_URL },
  concurrency: 1, // sequential — never exchange signed URLs in parallel
  lockDuration: JOB_TIMEOUT_MS,
});

worker.on("completed", (job) => {
  void notifyUploadFinished(prisma, job.data.uploadId);
  console.log(
    `FACEIT demo downloaded: ${job.id} -> match ${job.returnvalue?.matchId}`
  );
});

worker.on("failed", (job, err) => {
  console.error(`FACEIT demo download failed: ${job?.id}`, err.message);
  reportJobFailure("faceit-demo-download", job, err);
  // Only the last attempt leaves the upload FAILED; earlier ones are a no-op.
  if (job) void notifyUploadFinished(prisma, job.data.uploadId);
});

worker.on("ready", () => {
  console.log("FACEIT demo download worker ready, waiting for jobs...");
});
