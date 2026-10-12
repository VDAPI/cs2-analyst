/**
 * Sentry settings shared by the Next.js app and the BullMQ workers.
 *
 * Everything is off unless `SENTRY_DSN` is set, so local development and CI
 * need no Sentry account. `SENTRY_ENVIRONMENT` (default NODE_ENV) and
 * `SENTRY_TRACES_SAMPLE_RATE` (default 0.1) are optional.
 */

export function sentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || undefined;
}

export function sentryEnabled(): boolean {
  return Boolean(sentryDsn());
}

export function sentryTracesSampleRate(raw: string | undefined = process.env.SENTRY_TRACES_SAMPLE_RATE): number {
  const n = raw === undefined || raw === "" ? 0.1 : Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.1;
}

/** Base `Sentry.init` options; `service` tags events with where they came from. */
export function sentryBaseOptions(service: string) {
  const dsn = sentryDsn();
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: sentryTracesSampleRate(),
    initialScope: { tags: { service } },
  };
}
