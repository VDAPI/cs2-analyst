import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getVapidKeys } from "@/lib/notifications/vapid";
import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS_PER_USER } from "@/lib/notifications/push-endpoint";

/** GET /api/push/subscribe — the VAPID public key the browser subscribes with. */
export async function GET() {
  const { publicKey } = await getVapidKeys(prisma);
  return NextResponse.json({ publicKey });
}

const Subscription = z.object({
  // Only real push services: the server POSTs to this URL (no SSRF to internal hosts).
  endpoint: z.string().url().max(1000).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

/** POST /api/push/subscribe — store this browser's push subscription. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Subscription.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;

  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  // An endpoint belongs to one browser; if another account used it before, it moves here.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: session.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastUsedAt: new Date() },
  });
  // Cap fan-out: keep only the newest subscriptions of this account.
  const stale = await prisma.pushSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: [{ lastUsedAt: "desc" }, { createdAt: "desc" }],
    skip: MAX_PUSH_SUBSCRIPTIONS_PER_USER,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE /api/push/subscribe — forget this browser's subscription. */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: unknown };
  if (typeof body.endpoint !== "string") {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: session.user.id },
  });
  return NextResponse.json({ ok: true });
}
