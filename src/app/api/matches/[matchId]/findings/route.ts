import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getFindings } from "@/lib/findings/persist";
import { toFindingView } from "@/lib/findings/view";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/findings[?player=steamId]
 *
 * Every finding of the match (or one player's), with the catalog label, for
 * the replay's mistake markers. Built on first request for older matches.
 */
export async function GET(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const match = await prisma.match.findFirst({
    where: { id: matchId, upload: { userId: session.user.id } },
    select: { id: true },
  });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const player = new URL(req.url).searchParams.get("player") ?? undefined;
  const rows = await getFindings(prisma, matchId, player);

  return NextResponse.json({ findings: rows.map(toFindingView) });
}
