/**
 * "Analysis ready / failed" on Discord (S26): a DM from the bot to the linked
 * account and/or a post to the player's channel webhook. Called from
 * notifyUploadFinished next to the bell and Web Push; never throws.
 */
import type { PrismaClient } from "@prisma/client";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import type { NotificationData, NotificationKind } from "@/lib/notifications/text";
import { notificationMessage } from "./format";
import { normalizeWebhookUrl } from "./link";
import { appBaseUrl, discordConfig, DiscordApiError, executeWebhook, sendDirectMessage } from "./rest";

export interface DiscordSendResult {
  dm: boolean;
  webhook: boolean;
  /** Why a linked account got no DM: the bot isn't configured, or Discord refused (no shared server / DMs closed). */
  dmError: "no_bot" | "cannot_dm" | "failed" | null;
}

export async function notifyDiscord(
  prisma: PrismaClient,
  userId: string,
  n: { type: NotificationKind; matchId: string | null; data: NotificationData },
  opts: { force?: boolean } = {}
): Promise<DiscordSendResult> {
  const sent: DiscordSendResult = { dm: false, webhook: false, dmError: null };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locale: true, discordId: true, discordNotify: true, discordWebhookUrl: true },
  });
  if (!user || (!user.discordNotify && !opts.force)) return sent;
  const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
  const message = notificationMessage(locale, n, appBaseUrl());

  const { botToken } = discordConfig();
  if (user.discordId && !botToken) sent.dmError = "no_bot";
  if (user.discordId && botToken) {
    try {
      await sendDirectMessage(botToken, user.discordId, message);
      sent.dm = true;
    } catch (err) {
      // 50007: the player shares no server with the bot or closed DMs.
      const code = err instanceof DiscordApiError ? err.code : null;
      sent.dmError = code === 50007 ? "cannot_dm" : "failed";
      console.warn(`[discord] DM failed userId=${userId} code=${code ?? "?"}`, err instanceof Error ? err.message : err);
    }
  }

  const webhook = normalizeWebhookUrl(user.discordWebhookUrl);
  if (webhook) {
    try {
      await executeWebhook(webhook, message);
      sent.webhook = true;
    } catch (err) {
      // A deleted webhook answers 404 (code 10015): stop posting to it.
      if (err instanceof DiscordApiError && err.status === 404) {
        await prisma.user.update({ where: { id: userId }, data: { discordWebhookUrl: null } });
      }
      console.warn(`[discord] webhook failed userId=${userId}`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
