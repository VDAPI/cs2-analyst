import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { sendPushToUser } from "@/lib/notifications/push";
import { getT } from "@/lib/i18n/server";

/** POST /api/push/test — send a test notification to the player's devices. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { t } = await getT();
  const result = await sendPushToUser(prisma, session.user.id, {
    title: t("push.testTitle"),
    body: t("push.testBody"),
    url: "/settings",
    tag: "test",
  });
  return NextResponse.json(result);
}
