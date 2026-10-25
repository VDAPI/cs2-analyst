import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { newShareToken } from "@/lib/sharing/token";
import { rateLimit } from "@/lib/security/rate-limit-http";

const createSchema = z.object({
  steamIds: z.array(z.string().regex(/^\d{5,20}$/)).min(2).max(10),
  title: z.string().trim().min(1).max(60),
});

/**
 * POST /api/team-analysis/share — a public read-only link to a team's
 * analysis (the same roster reuses its live link). Returns { token }.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", userId);
  if (limited) return limited;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const steamIds = [...new Set(parsed.data.steamIds)].sort();

  const existing = await prisma.teamShare.findFirst({
    where: { userId, revokedAt: null, steamIds: { equals: steamIds } },
    select: { token: true },
  });
  if (existing) return NextResponse.json({ token: existing.token });
  const share = await prisma.teamShare.create({
    data: { token: newShareToken(), userId, steamIds, title: parsed.data.title },
    select: { token: true },
  });
  return NextResponse.json({ token: share.token }, { status: 201 });
}

/** DELETE /api/team-analysis/share?token= — revoke a link. */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  await prisma.teamShare.updateMany({ where: { token, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
