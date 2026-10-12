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
