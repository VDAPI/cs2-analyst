import { NextResponse } from "next/server";
import { getMatchAccess } from "@/lib/sharing/access";
import { prisma } from "@/lib/db/prisma";
import { proAdviceForFinding } from "@/lib/winprob/persist";

interface Props {
  params: Promise<{ matchId: string; findingId: string }>;
}

/**
 * GET /api/matches/[matchId]/findings/[findingId]/pro
 *
 * "Co zrobiłby pro" (S14): the player's situation a few seconds before the
 * mistake, matched against the same situations in pro demos of the map, with
 * what the pros did next and the closest examples (opened as 2D clips through
 * the pro match's own replay data). Signed-in owner only: the clips need a
 * session to read pro matches.
 */
export async function GET(req: Request, { params }: Props) {
  const { matchId, findingId } = await params;
  const access = await getMatchAccess(req, matchId);
  if (!access?.ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, matchId },
    select: { matchId: true, type: true, steamId: true, roundNumber: true, tick: true },
  });
  if (!finding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const advice = await proAdviceForFinding(prisma, finding);
  return NextResponse.json({ advice });
}
