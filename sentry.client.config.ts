// Browser Sentry. next.config.ts only wires this file in when SENTRY_DSN is
// set, and copies that DSN to NEXT_PUBLIC_SENTRY_DSN at build time. Next 15.1
// has no instrumentation-client.ts yet (15.3+); move this there after upgrading.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0.1,
    initialScope: { tags: { service: "browser" } },
  });
}
