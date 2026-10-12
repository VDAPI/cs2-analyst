import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

const Body = z.object({ ids: z.array(z.string().max(40)).max(100).optional() });

/** POST /api/notifications/read — mark the given ids (or all) as read. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  const ids = parsed.success ? parsed.data.ids : undefined;

  await prisma.notification.updateMany({
    where: { userId: session.user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
