import { Queue } from "bullmq";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

export const demoParseQueue = new Queue("demo-parse", { connection });

export interface FaceitDemoDownloadJobData {
  uploadId: string;
  faceitMatchId: string;
  userId: string;
}

export const faceitDemoDownloadQueue = new Queue<FaceitDemoDownloadJobData>(
  "faceit-demo-download",
  { connection }
);

/** Default job options for FACEIT demo downloads. */
export const FACEIT_DOWNLOAD_JOB_OPTS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 60_000 } as const,
} satisfies import("bullmq").JobsOptions;
