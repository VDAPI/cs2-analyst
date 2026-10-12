import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions, sentryEnabled } from "@/lib/monitoring/sentry-options";

/** Server and edge Sentry. Off unless SENTRY_DSN is set (see sentry-options.ts). */
export async function register() {
  if (!sentryEnabled()) return;
  Sentry.init(sentryBaseOptions(process.env.NEXT_RUNTIME === "edge" ? "web-edge" : "web"));
}

export const onRequestError = Sentry.captureRequestError;
