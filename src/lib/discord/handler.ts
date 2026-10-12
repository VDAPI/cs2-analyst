/**
 * Slash command handling (S26), shared by the HTTP interactions endpoint
 * (/api/discord/interactions) and the gateway bot (workers/discord-bot.worker.ts).
 * Data access comes in through `DiscordDeps`, so the logic is testable
 * without a database or Discord.
 */
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createT } from "@/lib/i18n/translate";
import { COMMAND, STATS_DEFAULT_MATCHES, STATS_MAX_MATCHES } from "./commands";
import {
  lastMatchMessage,
  statsMessage,
  textMessage,
  type DiscordMessage,
  type LastMatchSummary,
  type StatsSummary,
} from "./format";
import { hashLinkCode, normalizeLinkCode } from "./link";

/** InteractionType */
export const INTERACTION_PING = 1;
export const INTERACTION_COMMAND = 2;
/** InteractionCallbackType */
export const RESPONSE_PONG = 1;
export const RESPONSE_MESSAGE = 4;

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
}

export interface Interaction {
  id: string;
  application_id?: string;
  type: number;
  token: string;
  locale?: string;
  data?: {
    name: string;
    options?: Array<{ name: string; type: number; value?: string | number | boolean }>;
  };
  /** In a server. */
  member?: { user?: DiscordUser };
  /** In DMs / user-install contexts. */
  user?: DiscordUser;
}

export type InteractionResponse = { type: typeof RESPONSE_PONG } | { type: typeof RESPONSE_MESSAGE; data: DiscordMessage };

export interface LinkedAccount {
  userId: string;
  locale: string;
}

export interface DiscordDeps {
  appUrl: string;
  findLinked(discordId: string): Promise<LinkedAccount | null>;
  /** Consumes a valid unexpired code; returns the account's display name, or null. */
  linkByCode(codeHash: string, discordId: string, username: string, now: Date): Promise<{ name: string } | null>;
  unlink(discordId: string): Promise<boolean>;
  loadStats(userId: string, matches: number): Promise<StatsSummary | null>;
  loadLastMatch(userId: string): Promise<LastMatchSummary | null>;
}

/** The interaction's language: the account's, else the Discord client's (pl* → Polish, anything else English). */
export function interactionLocale(i: Pick<Interaction, "locale">, account?: LinkedAccount | null): Locale {
  if (account?.locale === "pl" || account?.locale === "en") return account.locale;
  if (!i.locale) return DEFAULT_LOCALE;
  return i.locale.toLowerCase().startsWith("pl") ? "pl" : "en";
}

function option(i: Interaction, name: string): string | number | boolean | undefined {
  return i.data?.options?.find((o) => o.name === name)?.value;
}

const reply = (data: DiscordMessage): InteractionResponse => ({ type: RESPONSE_MESSAGE, data });

export async function handleInteraction(i: Interaction, deps: DiscordDeps): Promise<InteractionResponse> {
  if (i.type === INTERACTION_PING) return { type: RESPONSE_PONG };

  const user = i.member?.user ?? i.user;
  const fallbackT = createT(interactionLocale(i));
  if (i.type !== INTERACTION_COMMAND || !i.data || !user) {
    return reply(textMessage(fallbackT("discord.unknownCommand")));
  }

  try {
    const name = i.data.name;
    const notLinked = () =>
      reply(textMessage(fallbackT("discord.notLinked", { url: `${deps.appUrl.replace(/\/+$/, "")}/settings#discord` })));

    if (name === COMMAND.link) {
      const code = normalizeLinkCode(String(option(i, "kod") ?? ""));
      if (!code) return reply(textMessage(fallbackT("discord.linkInvalid")));
      const label = user.global_name || user.username;
      const linked = await deps.linkByCode(hashLinkCode(code), user.id, label, new Date());
      if (!linked) return reply(textMessage(fallbackT("discord.linkInvalid")));
      const account = await deps.findLinked(user.id);
      return reply(textMessage(createT(interactionLocale(i, account))("discord.linked", { name: linked.name })));
    }

    if (name === COMMAND.unlink) {
      const account = await deps.findLinked(user.id);
      const t = createT(interactionLocale(i, account));
      return reply(textMessage((await deps.unlink(user.id)) ? t("discord.unlinked") : t("discord.unlinkNone")));
    }

    if (name === COMMAND.stats || name === COMMAND.lastMatch) {
      const account = await deps.findLinked(user.id);
      if (!account) return notLinked();
      const locale = interactionLocale(i, account);
      const t = createT(locale);
      const noMatches = () =>
        reply(textMessage(t("discord.noMatches", { url: `${deps.appUrl.replace(/\/+$/, "")}/upload` })));

      if (name === COMMAND.stats) {
        const raw = Number(option(i, "mecze") ?? STATS_DEFAULT_MATCHES);
        const n = Number.isFinite(raw) ? Math.min(STATS_MAX_MATCHES, Math.max(1, Math.round(raw))) : STATS_DEFAULT_MATCHES;
        const stats = await deps.loadStats(account.userId, n);
        return stats ? reply(statsMessage(locale, stats, deps.appUrl)) : noMatches();
      }
      const last = await deps.loadLastMatch(account.userId);
      return last ? reply(lastMatchMessage(locale, last, deps.appUrl)) : noMatches();
    }

    return reply(textMessage(fallbackT("discord.unknownCommand")));
  } catch (err) {
    console.error(`[discord] command ${i.data.name} failed`, err);
    return reply(textMessage(fallbackT("discord.error")));
  }
}
