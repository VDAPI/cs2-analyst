import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { sendPushToUser } from "@/lib/notifications/push";
import { getT } from "@/lib/i18n/server";
import { rateLimit } from "@/lib/security/rate-limit-http";

/** POST /api/push/test — send a test notification to the player's devices. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { t } = await getT();
  const result = await sendPushToUser(prisma, session.user.id, {
    title: t("push.testTitle"),
    body: t("push.testBody"),
    url: "/settings",
    tag: "test",
  });
  return NextResponse.json(result);
}
