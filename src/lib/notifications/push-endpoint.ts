/**
 * Which Web Push endpoints the server will POST to. The browser hands us the
 * URL, so without a check a user could make the server call internal hosts
 * (SSRF, with /api/push/test as a probing oracle). Only the browsers' push
 * services are allowed: https on the default port, no IP literals, no
 * credentials. Pure, so `npm run test:platform` covers it.
 */

/** Exact push-service hosts. */
const PUSH_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome, Edge (Chromium), Opera, Brave, Samsung
  "android.googleapis.com", // older Chrome subscriptions
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari
]);

/** Push-service domains whose subdomains are allowed. */
const PUSH_HOST_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

/** Most push subscriptions one account keeps (oldest are dropped). */
export const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  // IPv6 literals come back bracketed; IPv4 literals are all digits and dots.
  if (host.startsWith("[") || /^[\d.]+$/.test(host)) return false;
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s));
}
