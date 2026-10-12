/**
 * Sentry for the BullMQ worker processes (`workers/*.ts`). A no-op without
 * `SENTRY_DSN`.
 */
import * as Sentry from "@sentry/node";
import type { Job } from "bullmq";
import { sentryBaseOptions, sentryEnabled } from "./sentry-options";

let enabled = false;

/** Call once at worker start-up, before anything can throw. */
export function initWorkerSentry(service: string): boolean {
  if (!sentryEnabled()) return false;
  Sentry.init(sentryBaseOptions(service));
  enabled = true;
  return true;
}

/**
 * Report a failed job with its queue, id and payload (no secrets in job
 * data). Jobs with retries left are skipped; only the final failure counts.
 */
export function reportJobFailure(queue: string, job: Job | undefined, err: Error): void {
  if (!enabled) return;
  const final = err.name === "UnrecoverableError" || !job || job.attemptsMade >= (job.opts.attempts ?? 1);
  if (!final) return;
  Sentry.captureException(err, {
    tags: { queue, jobName: job?.name ?? "unknown" },
    extra: { jobId: job?.id, attemptsMade: job?.attemptsMade, data: job?.data },
  });
}

/** Report an error outside a job (start-up backfill and the like). */
export function reportWorkerError(err: unknown, context: string): void {
  if (!enabled) return;
  Sentry.captureException(err, { tags: { context } });
}
