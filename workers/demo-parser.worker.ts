/**
 * Demo Parser Background Worker
 *
 * Runs as a separate process via `npm run worker:parse`.
 * Listens to the "demo-parse" BullMQ queue and processes
 * uploaded .dem files, storing results in PostgreSQL.
 */

import { Worker, UnrecoverableError, type Job } from "bullmq";
import { stat, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { failUploadIfInFlight, parseAndPersistDemo } from "../src/lib/parsers/persist-demo";
import { backfillReplayData } from "../src/lib/parsers/backfill-replay";
import {
  deleteStoredDemo,
  finalizeDemoAfterAnalysis,
  openDemoForParsing,
  storeDemoFile,
  LOCAL_DEMO_DIR,
} from "../src/lib/storage/demo-store";
import { deleteAnalysis } from "../src/lib/library";
import { notifyUploadFinished } from "../src/lib/notifications/notify";
import { refreshPlanAfterAnalysis } from "../src/lib/coach/persist";
import { downloadReplayDemo, ReplayGoneError } from "../src/lib/steam/demo-download";
import { demoParseQueue, type SteamDemoDownloadJobData } from "../src/lib/queue";
import { backfillNormSamples, refreshNorms, refreshNormsIfStale } from "../src/lib/norms/persist";
import { backfillWinProb } from "../src/lib/winprob/persist";
import { requestTraining } from "../src/lib/winprob/train-trigger";
import { initWorkerSentry, reportJobFailure, reportWorkerError } from "../src/lib/monitoring/worker-sentry";

initWorkerSentry("worker-parse");

const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

interface DemoParseJobData {
  uploadId: string;
  /** DemoUpload.fileUrl: a local path or "r2://<key>". */
  filePath: string;
  userId: string;
}


async function processDemo(job: Job<DemoParseJobData>) {
  const { uploadId, filePath: fileUrl } = job.data;

  console.log(`[parser] start uploadId=${uploadId} fileUrl="${fileUrl}"`);

  // Cancelled from the queue screen before we got to it.
  const before = await prisma.demoUpload.findUnique({
    where: { id: uploadId },
    select: { deletedAt: true, status: true },
  });
  if (!before || before.deletedAt) {
    await deleteStoredDemo(fileUrl).catch(() => {});
    console.log(`[parser] skip uploadId=${uploadId}: removed by the user`);
    return null;
  }
  // A duplicate job (e.g. an admin re-queued an analysis that looked stuck
  // but was only waiting) must not parse a finished analysis a second time.
  if (before.status === "COMPLETED") {
    console.log(`[parser] skip uploadId=${uploadId}: already analyzed`);
    return null;
  }

  const demo = await openDemoForParsing(uploadId, fileUrl).catch(async (err) => {
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  });
  let result;
  try {
    result = await parseAndPersistDemo(
      prisma,
      { uploadId, filePath: demo.path },
      (pct) => job.updateProgress(pct)
    );
  } catch (err) {
    // Cancelled while it was running: nobody will retry it, drop the file.
    const cancelled = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { deletedAt: true },
    });
    if (cancelled?.deletedAt) await deleteStoredDemo(fileUrl).catch(() => {});
    throw err;
  } finally {
    await demo.cleanup();
  }

  // Removed by the user while it was being analyzed.
  const after = await prisma.demoUpload.findUnique({
    where: { id: uploadId },
    select: { deletedAt: true },
  });
  if (after?.deletedAt) {
    await deleteAnalysis(prisma, uploadId);
    return result;
  }

  // The report and replay data are in the DB now: drop the .dem (unless
  // "keep demo", or the replay data failed to store).
  const demoFate = await finalizeDemoAfterAnalysis(prisma, uploadId, result.replayStored).catch(
    (err) => {
      // The analysis is done; a failed delete only leaves the file behind.
      console.error(`[parser] deleting demo failed uploadId=${uploadId}`, err);
      return "kept" as const;
    }
  );
  console.log(`[parser] done uploadId=${uploadId} match=${result.matchId} demo=${demoFate}`);

  return result;
}

// ─── Start Worker ────────────────────────────────────────

const worker = new Worker("demo-parse", processDemo, {
  connection: { url: REDIS_URL },
  concurrency: 2,
  // demoparser2 blocks the event loop for a whole native parse, so the lock
  // can't be renewed meanwhile. With BullMQ's 30 s default a big demo lost its
  // lock and was parsed a second time by the other slot. Same as the
  // download workers.
  lockDuration: 10 * 60 * 1000,
  limiter: {
    max: 10,
    duration: 60_000,
  },
});

worker.on("completed", (job) => {
  console.log(`Demo parsed: ${job.id} -> match ${job.returnvalue?.matchId}`);
  void notifyUploadFinished(prisma, job.data.uploadId);
  // The uploader's weekly training plan (S15) is rebuilt from the new match.
  void refreshPlanAfterAnalysis(prisma, job.data.uploadId);
});

worker.on("failed", (job, err) => {
  console.error(`Demo parse failed: ${job?.id}`, err.message);
  reportJobFailure("demo-parse", job, err);
  // Parse jobs run once. Our own catch normally left the upload FAILED; if it
  // didn't, mark it FAILED here or it stays PARSING and can never be retried.
  // That includes a job that stalled more often than allowed (the process died
  // mid-parse): BullMQ fails it through the next Worker that picks it up, with
  // "job stalled more than allowable limit", without running processDemo.
  if (job) {
    const { uploadId } = job.data;
    void failUploadIfInFlight(prisma, uploadId, err.message).then(() =>
      notifyUploadFinished(prisma, uploadId)
    );
  }
});

worker.on("ready", () => {
  console.log("Demo parser worker ready, waiting for jobs...");
});

// ─── Premier / Steam replay downloads (S18) ──────────────
//
// Fetches the .dem.bz2 from a Valve replay link the player gave us, stores
// the .dem like a manual upload and hands it to the parse queue above. Lives
// in this process so nobody has to start another worker.

async function processSteamDownload(job: Job<SteamDemoDownloadJobData>) {
  const { uploadId, steamMatchId, userId } = job.data;
  const destPath = join(LOCAL_DEMO_DIR, `${uploadId}.dem`);
  console.log(`[steam-download] start uploadId=${uploadId}`);

  try {
    const upload = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { deletedAt: true },
    });
    if (!upload || upload.deletedAt) return null;

    const sm = await prisma.steamMatch.findUnique({ where: { id: steamMatchId } });
    if (!sm || sm.userId !== userId || !sm.demoUrl) {
      throw new UnrecoverableError("Premier match or its replay link is gone");
    }

    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "DOWNLOADING", error: null },
    });
    await mkdir(LOCAL_DEMO_DIR, { recursive: true });
    try {
      await downloadReplayDemo(sm.demoUrl, destPath);
    } catch (err) {
      if (err instanceof ReplayGoneError) throw new UnrecoverableError(err.message);
      throw err;
    }
    const { size } = await stat(destPath);
    const fileUrl = await storeDemoFile(uploadId, destPath);
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { fileUrl, fileSize: size, status: "QUEUED" },
    });
    await demoParseQueue.add("parse", { uploadId, filePath: fileUrl, userId });
    console.log(`[steam-download] queued parse uploadId=${uploadId} size=${size}`);
    return { uploadId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const last =
      err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await unlink(destPath).catch(() => {});
    await prisma.demoUpload
      .update({
        where: { id: uploadId },
        data: last
          ? { status: "FAILED", error: message }
          : { status: "QUEUED", error: `${message} (retrying)` },
      })
      .catch(() => {});
    if (last) await notifyUploadFinished(prisma, uploadId);
    throw err;
  }
}

const steamWorker = new Worker("steam-demo-download", processSteamDownload, {
  connection: { url: REDIS_URL },
  concurrency: 1,
  lockDuration: 10 * 60 * 1000,
});

steamWorker.on("failed", (job, err) => {
  console.error(`Steam replay download failed: ${job?.id}`, err.message);
  reportJobFailure("steam-demo-download", job, err);
  // finishedOn is set only when the job won't be retried. Our catch settles
  // the upload on the last attempt, but a job failed for stalling too often
  // never reaches it: settle it here (no-op if it is FAILED already).
  if (job?.finishedOn) {
    const { uploadId } = job.data;
    void failUploadIfInFlight(prisma, uploadId, err.message).then(() =>
      notifyUploadFinished(prisma, uploadId)
    );
  }
});

// Store replay data for older matches that still have their .dem, so nobody
// has to run `npm run backfill:replay` by hand. Runs once per start, in the
// background; matches that already have it are skipped.
backfillReplayData(prisma, {}, (line) => console.log(`[replay-backfill]${line}`))
  .then((r) => {
    if (r.done + r.failed + r.missingFile > 0) {
      console.log(
        `[replay-backfill] stored ${r.done}, no demo file ${r.missingFile}, failed ${r.failed}`
      );
    }
  })
  .catch((err) => {
    console.error("[replay-backfill] failed:", err);
    reportWorkerError(err, "replay-backfill");
  })
  // Then norm samples (S13) for matches analysed before them, and the norms.
  .then(() => backfillNormSamples(prisma, { log: (line) => console.log(`[norms-backfill]${line}`) }))
  .then(async (sampled) => {
    if (sampled > 0) console.log(`[norms-backfill] sampled ${sampled} matches`);
    if (sampled > 0) await refreshNorms(prisma);
    else await refreshNormsIfStale(prisma);
  })
  .catch((err) => {
    console.error("[norms-backfill] failed:", err);
    reportWorkerError(err, "norms-backfill");
  })
  // Then win-probability snapshots and pro situations (S14), and a retrain if there is new data.
  .then(() => backfillWinProb(prisma, { log: (line) => console.log(`[winprob-backfill]${line}`) }))
  .then(async (done) => {
    if (done && done > 0) console.log(`[winprob-backfill] stored ${done} matches`);
    console.log(`[winprob] ${await requestTraining({ force: false })}`);
  })
  .catch((err) => {
    console.error("[winprob-backfill] failed:", err);
    reportWorkerError(err, "winprob-backfill");
  });
