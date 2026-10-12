/**
 * VAPID keys for Web Push. Taken from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * when set; otherwise generated once and stored in AppSetting, so push works
 * without manual setup (the Next.js server and the workers share the DB).
 */
import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const KEY = "vapid";
let cached: VapidKeys | null = null;

export function vapidSubject(): string {
  return process.env.VAPID_SUBJECT ?? "mailto:admin@cs2analyst.local";
}

export async function getVapidKeys(prisma: PrismaClient): Promise<VapidKeys> {
  if (cached) return cached;
  const subject = vapidSubject();

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
      subject,
    };
    return cached;
  }

  const existing = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (existing) {
    const parsed = JSON.parse(existing.value) as { publicKey: string; privateKey: string };
    cached = { ...parsed, subject };
    return cached;
  }

  const generated = webpush.generateVAPIDKeys();
  // Two processes may race on the first push: keep whichever row won.
  await prisma.appSetting
    .create({ data: { key: KEY, value: JSON.stringify(generated) } })
    .catch(() => {});
  const row = await prisma.appSetting.findUniqueOrThrow({ where: { key: KEY } });
  const parsed = JSON.parse(row.value) as { publicKey: string; privateKey: string };
  cached = { ...parsed, subject };
  return cached;
}
