/**
 * Request body limits for API routes (S29), enforced by the middleware from
 * Content-Length. Demo uploads stream multipart bodies and check their own
 * size (700 MB + form overhead); the avatar is a ~4 MB data URI; everything
 * else is a small JSON body.
 */
const MB = 1024 * 1024;

export const DEFAULT_BODY_LIMIT = 64 * 1024;

/** Exact paths: /api/uploads/<id> and /api/admin/pro/<id> take small JSON like the rest. */
const LIMITS: Record<string, number> = {
  "/api/uploads": 702 * MB,
  "/api/admin/pro": 702 * MB,
  "/api/user/avatar": 5 * MB,
  // Stripe events are signed JSON, usually a few KB; a subscription with
  // many items or a long invoice can pass 64 KB.
  "/api/billing/webhook": MB,
};

/** Largest body accepted on `pathname`. Pure. */
export function bodyLimitFor(pathname: string): number {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return LIMITS[path] ?? DEFAULT_BODY_LIMIT;
}
