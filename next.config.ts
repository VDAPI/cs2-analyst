import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const sentryDsn = process.env.SENTRY_DSN;

const nextConfig: NextConfig = {
  serverExternalPackages: ["@laihoe/demoparser2"],
  experimental: {
    serverActions: {
      bodySizeLimit: "750mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.steamstatic.com",
      },
      {
        protocol: "https",
        hostname: "steamcdn-a.akamaihd.net",
      },
    ],
  },
  // One DSN for server, workers and browser (sentry.client.config.ts).
  env: sentryDsn
    ? {
        NEXT_PUBLIC_SENTRY_DSN: sentryDsn,
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "",
      }
    : {},
};

// Sentry's build plugin only runs when Sentry is set up; source maps are
// uploaded only with SENTRY_AUTH_TOKEN (+ SENTRY_ORG, SENTRY_PROJECT).
export default sentryDsn
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    })
  : nextConfig;
