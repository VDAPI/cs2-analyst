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
import { unlink } from "fs/promises";

const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

interface DemoParseJobData {
  uploadId: string;
  filePath: string;
  userId: string;
}


async function processDemo(job: Job<DemoParseJobData>) {
  const { uploadId, filePath } = job.data;

  console.log(`[parser] start uploadId=${uploadId} filePath="${filePath}"`);

  const result = await parseAndPersistDemo(
    prisma,
    { uploadId, filePath },
    (pct) => job.updateProgress(pct)
  );

  // Clean up FACEIT demos (re-downloadable, save disk space)
  const upload = await prisma.demoUpload.findUnique({
    where: { id: uploadId },
    select: { source: true },
  });
  if (upload?.source === "FACEIT") {
    await unlink(filePath).catch(() => {});
  }

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
