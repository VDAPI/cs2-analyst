/**
 * Web Push delivery. Subscriptions the push service reports as gone
 * (404/410) are deleted; other failures are logged and ignored, since a
 * notification must never fail an analysis.
 */
import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";
import { getVapidKeys } from "./vapid";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** Same tag replaces an older notification instead of stacking. */
  tag?: string;
}

export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; removed: number }> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { sent: 0, removed: 0 };

  const vapid = await getVapidKeys(prisma);
  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          {
            vapidDetails: vapid,
            TTL: 24 * 60 * 60,
            urgency: "normal",
          }
        );
        sent++;
        await prisma.pushSubscription
          .update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } })
          .catch(() => {});
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          removed++;
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`[push] send failed user=${userId} status=${status ?? "?"}`, err);
        }
      }
    })
  );
  return { sent, removed };
}
