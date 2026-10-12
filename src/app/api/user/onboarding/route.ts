import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

/** POST /api/user/onboarding — the player finished or skipped the report guide (S21); it no longer opens by itself. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.user.updateMany({
    where: { id: session.user.id, reportTourAt: null },
    data: { reportTourAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
