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
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getSignedDemoUrl,
  downloadAndDecompressDemo,
  DemoNotReadyError,
} from "../src/lib/faceit/downloads";
import { refreshDemoResource } from "../src/lib/faceit/sync";
import { parseAndPersistDemo } from "../src/lib/parsers/persist-demo";
import type { FaceitDemoDownloadJobData } from "../src/lib/queue";

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
    const faceitMatch = await prisma.faceitMatch.findUnique({
      where: { faceitMatchId },
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
        where: { faceitMatchId },
        data: { demoStatus: "NOT_READY" },
      });
      // Retryable — demo may become available on a later attempt.
      throw new DemoNotReadyError("Demo resource URL not yet available");
    }

    // 2. Exchange for a short-lived signed URL and stream + decompress.
    //    Exchange immediately before download — never persist the signed URL.
    const signedUrl = await getSignedDemoUrl(resourceUrl);
    await downloadAndDecompressDemo(signedUrl, destPath);

    // 3. Parse + persist inline (drives the DemoUpload status machine).
    const result = await parseAndPersistDemo(
      prisma,
      { uploadId, filePath: destPath },
      (pct) => job.updateProgress(pct)
    );

    await prisma.faceitMatch.update({
      where: { faceitMatchId },
      data: { demoStatus: "DOWNLOADED" },
    });

    console.log(
      `[faceit-download] done uploadId=${uploadId} matchId=${result.matchId}`
    );
    return result;
  } catch (err) {
    if (err instanceof DemoNotReadyError) {
      console.log(
        `[faceit-download] not ready uploadId=${uploadId}: ${err.message} (attempt ${job.attemptsMade + 1})`
      );
      // Leave the DemoUpload QUEUED so the UI keeps polling; rethrow to retry.
      throw err;
    }

    // Permanent failure only once retries are exhausted (or unrecoverable).
    const isLastAttempt =
      err instanceof UnrecoverableError ||
      job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isLastAttempt) {
      await failUpload(uploadId, err instanceof Error ? err.message : "Unknown error");
      await prisma.faceitMatch
        .update({
          where: { faceitMatchId },
          data: { demoStatus: "FAILED" },
        })
        .catch(() => {});
    }
    throw err;
  } finally {
    // Always clean up the decompressed .dem from temp (the .zst is removed
    // inside downloadAndDecompressDemo). Parse already read it by now.
    await unlink(destPath).catch(() => {});
  }
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
  console.log(
    `FACEIT demo downloaded: ${job.id} -> match ${job.returnvalue?.matchId}`
  );
});

worker.on("failed", (job, err) => {
  console.error(`FACEIT demo download failed: ${job?.id}`, err.message);
});

worker.on("ready", () => {
  console.log("FACEIT demo download worker ready, waiting for jobs...");
});
