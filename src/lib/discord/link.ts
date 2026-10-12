/**
 * Discord account linking and channel webhooks (S26). Pure: no DB, no network.
 *
 * Linking: Settings shows a one-time code; the player types `/polacz <kod>`
 * to the bot, which stores their Discord user id on the account. Only the
 * sha256 of the code is stored, it expires after LINK_CODE_TTL_MS and is
 * consumed by the first successful link.
 */
import { createHash, randomInt } from "crypto";

export const LINK_CODE_TTL_MS = 10 * 60_000;
export const LINK_CODE_LENGTH = 8;
/** No 0/O, 1/I/L: the code is read off one screen and typed into another. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newLinkCode(): string {
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** What the player typed → the canonical code, or null when it can't be one. */
export function normalizeLinkCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== LINK_CODE_LENGTH) return null;
  for (const ch of code) if (!ALPHABET.includes(ch)) return null;
  return code;
}

export function hashLinkCode(code: string): string {
  return createHash("sha256").update(`cs2a-discord:${code}`).digest("hex");
}

/** "ABCD-EFGH", easier to read; normalizeLinkCode accepts both forms. */
export function formatLinkCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const WEBHOOK_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);
const WEBHOOK_PATH = /^\/api(?:\/v\d+)?\/webhooks\/(\d{15,25})\/([\w-]{20,100})\/?$/;

/**
 * A Discord channel webhook URL, normalised to https://discord.com/api/webhooks/<id>/<token>,
 * or null. Only Discord's own hosts pass, so the server never posts anywhere else.
 */
export function normalizeWebhookUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!WEBHOOK_HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = WEBHOOK_PATH.exec(url.pathname);
  if (!m) return null;
  return `https://discord.com/api/webhooks/${m[1]}/${m[2]}`;
}

/** The webhook without its token, safe to show back in Settings. */
export function maskWebhookUrl(url: string): string {
  const m = /\/webhooks\/(\d+)\//.exec(url);
  return m ? `discord.com/api/webhooks/${m[1]}/…` : "discord.com/api/webhooks/…";
}
