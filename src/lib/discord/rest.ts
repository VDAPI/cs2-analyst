/**
 * Minimal Discord REST client (S26): hand-rolled `fetch`, no SDK, like the
 * Stripe and R2 clients. Bot-token calls need DISCORD_BOT_TOKEN; channel
 * webhooks and interaction callbacks carry their own token in the URL.
 */
import type { CommandDefinition } from "./commands";
import type { DiscordMessage } from "./format";
import type { InteractionResponse } from "./handler";

export const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordConfig {
  botToken: string | null;
  applicationId: string | null;
  publicKey: string | null;
}

export function discordConfig(env: NodeJS.ProcessEnv = process.env): DiscordConfig {
  const v = (s: string | undefined) => (s && s.trim() ? s.trim() : null);
  return {
    botToken: v(env.DISCORD_BOT_TOKEN),
    applicationId: v(env.DISCORD_APPLICATION_ID),
    publicKey: v(env.DISCORD_PUBLIC_KEY),
  };
}

/** Public address of the app for links in Discord messages. */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.APP_URL || env.NEXTAUTH_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
}

export class DiscordApiError extends Error {
  constructor(
    public status: number,
    public code: number | null,
    message: string
  ) {
    super(message);
  }
}

type FetchFn = typeof fetch;

async function call<T>(
  path: string,
  init: { method: string; body?: unknown; botToken?: string | null; fetchFn?: FetchFn },
  attempt = 0
): Promise<T> {
  const headers: Record<string, string> = { "User-Agent": "CS2Analyst (https://github.com/vdapi/cs2-analyst, 1.0)" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.botToken) headers.Authorization = `Bot ${init.botToken}`;
  const res = await (init.fetchFn ?? fetch)(path.startsWith("https://") ? path : `${DISCORD_API}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429 && attempt < 2) {
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const wait = Math.min(10, Math.max(0.2, Number(body.retry_after) || 1));
    await new Promise((r) => setTimeout(r, wait * 1000));
    return call<T>(path, init, attempt + 1);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = (json ?? {}) as { code?: number; message?: string };
    throw new DiscordApiError(res.status, typeof err.code === "number" ? err.code : null, err.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}

/** Sends a direct message from the bot. Needs a server shared with the player (or the app on their account). */
export async function sendDirectMessage(botToken: string, discordUserId: string, message: DiscordMessage, fetchFn?: FetchFn): Promise<void> {
  const channel = await call<{ id: string }>("/users/@me/channels", {
    method: "POST",
    body: { recipient_id: discordUserId },
    botToken,
    fetchFn,
  });
  await call(`/channels/${channel.id}/messages`, { method: "POST", body: message, botToken, fetchFn });
}

/** Posts to a channel webhook (already validated by normalizeWebhookUrl). */
export async function executeWebhook(webhookUrl: string, message: DiscordMessage, fetchFn?: FetchFn): Promise<void> {
  const body: DiscordMessage = { ...message };
  delete body.flags; // "ephemeral" means nothing in a channel post
  await call(webhookUrl, { method: "POST", body: { username: "CS2 Analyst", ...body }, fetchFn });
}

/** Answers an interaction received over the gateway. */
export async function respondToInteraction(id: string, token: string, response: InteractionResponse, fetchFn?: FetchFn): Promise<void> {
  await call(`/interactions/${id}/${token}/callback`, { method: "POST", body: response, fetchFn });
}

/** Replaces the app's global slash commands (idempotent). */
export async function registerCommands(botToken: string, applicationId: string, commands: CommandDefinition[], fetchFn?: FetchFn): Promise<void> {
  await call(`/applications/${applicationId}/commands`, { method: "PUT", body: commands, botToken, fetchFn });
}

/** The application id behind a bot token. */
export async function fetchApplicationId(botToken: string, fetchFn?: FetchFn): Promise<string> {
  const app = await call<{ id: string }>("/applications/@me", { method: "GET", botToken, fetchFn });
  return app.id;
}
