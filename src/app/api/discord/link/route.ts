import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { formatLinkCode, hashLinkCode, LINK_CODE_TTL_MS, newLinkCode } from "@/lib/discord/link";
import { rateLimit } from "@/lib/security/rate-limit-http";

/**
 * POST /api/discord/link — a new one-time code for the bot's `/polacz` (S26).
 * Only its hash is stored; a new code replaces the previous one.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;

  const code = newLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { discordLinkCode: hashLinkCode(code), discordLinkExpires: expiresAt },
  });
  return NextResponse.json({ code: formatLinkCode(code), expiresAt: expiresAt.toISOString() });
}

/** DELETE /api/discord/link — unlink the Discord account (the channel webhook stays). */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { discordId: null, discordUsername: null, discordLinkCode: null, discordLinkExpires: null },
  });
  return NextResponse.json({ ok: true });
}
