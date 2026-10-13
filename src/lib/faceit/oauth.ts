/**
 * Base URL of the FACEIT OAuth redirect (/api/faceit/link/callback) and of
 * the pages the link flow returns to. FACEIT only accepts registered https
 * redirect URIs, so a deployment reached over plain http sets
 * FACEIT_OAUTH_BASE_URL to its https address (the local Docker setup of S20:
 * https://localhost:3443). Defaults to NEXTAUTH_URL.
 */
export function faceitOAuthBaseUrl(): string {
  return (process.env.FACEIT_OAUTH_BASE_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "");
}

export function faceitRedirectUri(): string {
  return `${faceitOAuthBaseUrl()}/api/faceit/link/callback`;
}

/** Linking needs the OAuth client from FACEIT Developers (CLAUDE.md, FACEIT Integration). */
export function isFaceitLinkConfigured(): boolean {
  return !!process.env.FACEIT_CLIENT_ID && !!process.env.FACEIT_CLIENT_SECRET;
}

/** Cookie holding the address the link was started from (see faceitReturnOrigin). */
export const FACEIT_RETURN_COOKIE = "faceit-link-return";

/**
 * Where the popup reports back to. FACEIT returns to faceitOAuthBaseUrl(),
 * which can be another port than the page that opened the popup (S20:
 * Settings on http://localhost:3000, callback on https://localhost:3443).
 * Only an origin on the callback's own host is accepted, so the cookie can't
 * turn the callback into an open redirect.
 */
export function faceitReturnOrigin(cookieValue: string | undefined, callbackOrigin: string): string {
  if (!cookieValue) return callbackOrigin;
  try {
    const want = new URL(cookieValue);
    const have = new URL(callbackOrigin);
    if ((want.protocol === "http:" || want.protocol === "https:") && want.hostname === have.hostname) return want.origin;
  } catch {
    // Malformed cookie: fall through.
  }
  return callbackOrigin;
}
