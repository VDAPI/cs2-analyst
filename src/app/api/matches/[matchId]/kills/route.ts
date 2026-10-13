import { NextResponse } from "next/server";
import { getMatchAccess, roundAllowed } from "@/lib/sharing/access";
import { prisma } from "@/lib/db/prisma";
import { parseRoundParam } from "@/lib/sharing/share";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/kills?round=1
 *
 * Returns kill events for a round (used by replay viewer for kill markers).
 */
export async function GET(req: Request, { params }: Props) {
  const { matchId } = await params;
  // The uploader, or a share link of this match (S16).
  const access = await getMatchAccess(req, matchId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const roundNum = parseRoundParam(url.searchParams.get("round"));
  if (roundNum == null) return NextResponse.json({ error: "Invalid round" }, { status: 400 });
  if (!roundAllowed(access, roundNum)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const round = await prisma.round.findUnique({
    where: { matchId_number: { matchId, number: roundNum } },
    include: {
      kills: {
        orderBy: { tick: "asc" },
        select: {
          tick: true,
          attackerName: true,
          victimName: true,
          victimPosX: true,
          victimPosY: true,
          weapon: true,
          headshot: true,
        },
      },
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const kills = round.kills.map((k) => ({
    tick: k.tick,
    attackerName: k.attackerName,
    victimName: k.victimName,
    victimX: k.victimPosX,
    victimY: k.victimPosY,
    weapon: k.weapon,
    headshot: k.headshot,
  }));

  return NextResponse.json({ kills });
}
