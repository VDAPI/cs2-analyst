/**
 * Security headers (S29), sent on every response by next.config.ts. Kept
 * free of imports so next.config.ts can load it and `test:security` can
 * check it.
 *
 * The CSP allows inline scripts and styles: the App Router inlines its RSC
 * payload as <script> tags, and a nonce would need the middleware to render
 * every page dynamically. What it does stop: framing (clickjacking), plugins,
 * <base> hijacking, and network calls to anything but this origin (plus the
 * Sentry ingest host when Sentry is on). No Cross-Origin-Opener-Policy: the
 * FACEIT link popup comes back from faceit.com and posts to its opener, and
 * COOP would cut that link.
 */
export interface HeaderOptions {
  dev: boolean;
  /** Public URL of the app (NEXTAUTH_URL); HSTS only when it is https. */
  appUrl?: string;
  /** SENTRY_DSN, so the browser SDK may post to its ingest host. */
  sentryDsn?: string;
}

export function contentSecurityPolicy({ dev, sentryDsn }: HeaderOptions): string {
  const connect = ["'self'"];
  if (sentryDsn) {
    try {
      connect.push(new URL(sentryDsn).origin);
    } catch {
      // A malformed DSN: Sentry won't send anything anyway.
    }
  }
  // Turbopack's dev client talks over a websocket and evals modules.
  if (dev) connect.push("ws:", "wss:");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Avatars: Steam / FACEIT CDNs and data: URIs (uploaded avatars), canvases as blob:.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

export function securityHeaders(opts: HeaderOptions): { key: string; value: string }[] {
  const headers = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];
  if (!opts.dev && hstsHost(opts.appUrl)) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return headers;
}

/**
 * HSTS only for a real https domain: never on localhost or a bare IP, where
 * the local Docker setup (S20) also serves plain http on another port and a
 * pinned host would lock that out.
 */
function hstsHost(appUrl: string | undefined): boolean {
  if (!appUrl?.startsWith("https://")) return false;
  try {
    const host = new URL(appUrl).hostname;
    return host !== "localhost" && !host.endsWith(".localhost") && !/^[\d.]+$|^\[|:/.test(host);
  } catch {
    return false;
  }
}
