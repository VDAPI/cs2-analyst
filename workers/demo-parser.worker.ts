/**
 * Demo Parser Background Worker
 *
 * Runs as a separate process via `npm run worker:parse`.
 * Listens to the "demo-parse" BullMQ queue and processes
 * uploaded .dem files, storing results in PostgreSQL.
 */

import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { parseAndPersistDemo } from "../src/lib/parsers/persist-demo";
import { backfillReplayData } from "../src/lib/parsers/backfill-replay";
import {
  deleteStoredDemo,
  finalizeDemoAfterAnalysis,
  openDemoForParsing,
} from "../src/lib/storage/demo-store";
import { deleteAnalysis } from "../src/lib/library";

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
    select: { deletedAt: true },
  });
  if (!before || before.deletedAt) {
    await deleteStoredDemo(fileUrl).catch(() => {});
    console.log(`[parser] skip uploadId=${uploadId}: removed by the user`);
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
  limiter: {
    max: 10,
    duration: 60_000,
  },
});

worker.on("completed", (job) => {
  console.log(`Demo parsed: ${job.id} -> match ${job.returnvalue?.matchId}`);
});

worker.on("failed", (job, err) => {
  console.error(`Demo parse failed: ${job?.id}`, err.message);
});

worker.on("ready", () => {
  console.log("Demo parser worker ready, waiting for jobs...");
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
  .catch((err) => console.error("[replay-backfill] failed:", err));
