/** Route-handler helpers for the billing endpoints (S30). */

/**
 * The address the player is on, for Stripe's return links. The local setup
 * serves one app on several origins (S20), so it comes from the request,
 * through the proxy headers when there is one.
 */
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(/:$/, "");
  return `${proto === "https" ? "https" : "http"}://${host}`;
}
