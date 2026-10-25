import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { notifyDiscord } from "@/lib/discord/notify";
import { rateLimit } from "@/lib/security/rate-limit-http";

/**
 * POST /api/discord/test — sends an "analysis ready" message for the latest
 * analysed match (or a sample one) to the linked DM and the channel webhook.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("discordTest", session.user.id);
  if (limited) return limited;

  const latest = await prisma.match.findFirst({
    where: { upload: { kind: "PLAYER", userId: session.user.id, deletedAt: null } },
    orderBy: { date: "desc" },
    select: { id: true, map: true, scoreCT: true, scoreT: true },
  });
  const sent = await notifyDiscord(prisma, session.user.id, {
    type: "ANALYSIS_DONE",
    matchId: latest?.id ?? null,
    data: latest ? { map: latest.map, score: `${latest.scoreCT}:${latest.scoreT}` } : { map: "de_mirage", score: "13:9" },
  }, { force: true });
  return NextResponse.json(sent, { status: sent.dm || sent.webhook ? 200 : 422 });
}
