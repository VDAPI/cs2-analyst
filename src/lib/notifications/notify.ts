/**
 * "Analysis ready / failed" notifications (S18). Called by the workers once
 * an upload reaches its final state: stores an in-app notification (the bell)
 * and sends Web Push to the player's devices, in the player's language.
 */
import type { PrismaClient } from "@prisma/client";
import { createT } from "@/lib/i18n/translate";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { sendPushToUser } from "./push";
import { notifyDiscord } from "@/lib/discord/notify";
import { notificationView, type NotificationData } from "./text";

/** Notifies about one upload, based on its current status. No-op while it is still running. */
export async function notifyUploadFinished(prisma: PrismaClient, uploadId: string): Promise<void> {
  try {
    const upload = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: {
        userId: true,
        status: true,
        error: true,
        fileName: true,
        matchId: true,
        deletedAt: true,
        match: { select: { map: true, scoreCT: true, scoreT: true } },
        user: { select: { locale: true } },
      },
    });
    if (!upload || upload.deletedAt) return;
    if (upload.status !== "COMPLETED" && upload.status !== "FAILED") return;

    const type = upload.status === "COMPLETED" ? "ANALYSIS_DONE" : "ANALYSIS_FAILED";

    // A retried job can finish twice; one notification per upload and outcome
    // within a few minutes is enough.
    const recent = await prisma.notification.findFirst({
      where: { uploadId, type, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
      select: { id: true },
    });
    if (recent) return;

    const data: NotificationData = {
      map: upload.match?.map ?? null,
      score: upload.match ? `${upload.match.scoreCT}:${upload.match.scoreT}` : null,
      fileName: upload.fileName,
      error: type === "ANALYSIS_FAILED" ? upload.error : null,
    };
    await prisma.notification.create({
      data: { userId: upload.userId, type, uploadId, matchId: upload.matchId, data: { ...data } },
    });

    const locale = isLocale(upload.user.locale) ? upload.user.locale : DEFAULT_LOCALE;
    const view = notificationView(createT(locale), { type, matchId: upload.matchId, data });
    await sendPushToUser(prisma, upload.userId, { ...view, tag: `upload-${uploadId}` });
    // Discord (S26): DM from the bot and/or the player's channel webhook.
    // Not awaited: Discord retries (429, timeouts) must not hold up the worker.
    void notifyDiscord(prisma, upload.userId, { type, matchId: upload.matchId, data }).catch((err) =>
      console.error(`[notify] discord failed uploadId=${uploadId}`, err)
    );
  } catch (err) {
    console.error(`[notify] failed uploadId=${uploadId}`, err);
  }
}

/** "X wants to be your friend" / "X accepted" (S25): the bell plus Web Push. Never throws. */
export async function notifyFriend(
  prisma: PrismaClient,
  n: { userId: string; type: "FRIEND_REQUEST" | "FRIEND_ACCEPTED"; name: string }
): Promise<void> {
  try {
    const data: NotificationData = { name: n.name };
    await prisma.notification.create({ data: { userId: n.userId, type: n.type, data: { ...data } } });
    const user = await prisma.user.findUnique({ where: { id: n.userId }, select: { locale: true } });
    const locale = user && isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
    const view = notificationView(createT(locale), { type: n.type, matchId: null, data });
    await sendPushToUser(prisma, n.userId, { ...view, tag: `friend-${n.type}` });
  } catch (err) {
    console.error(`[notify] friend notification failed userId=${n.userId}`, err);
  }
}
