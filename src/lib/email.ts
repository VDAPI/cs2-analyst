/**
 * Email rules shared by registration, login and the admin grant script.
 * Pure, so `npm run test:admin` covers it.
 */

/** Stored and looked-up form of an address: trimmed, lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * next-auth-steam gives Steam sign-ins the pseudo address
 * `<steamid64>@steamcommunity.com`. Registering one with a password would
 * block that Steam user's first "Sign in with Steam" (OAuthAccountNotLinked),
 * so the domain cannot be registered.
 */
export function isSteamPseudoEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@").pop() ?? "";
  return domain === "steamcommunity.com" || domain.endsWith(".steamcommunity.com");
}
