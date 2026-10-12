import { NextResponse } from "next/server";
import { getMatchAccess, roundAllowed } from "@/lib/sharing/access";
import { prisma } from "@/lib/db/prisma";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/bombs?round=1
 *
 * Returns bomb events for a round (used by replay viewer for bomb marker).
 */
export async function GET(req: Request, { params }: Props) {
  const { matchId } = await params;
  // The uploader, or a share link of this match (S16).
  const access = await getMatchAccess(req, matchId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const roundNum = parseInt(url.searchParams.get("round") ?? "1", 10);
  if (!roundAllowed(access, roundNum)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const round = await prisma.round.findUnique({
    where: { matchId_number: { matchId, number: roundNum } },
    include: {
      bombs: {
        orderBy: { tick: "asc" },
        select: {
          tick: true,
          type: true,
          posX: true,
          posY: true,
          posZ: true,
          site: true,
        },
      },
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const bombs = round.bombs.map((e) => ({
    tick: e.tick,
    type: e.type,
    x: e.posX,
    y: e.posY,
    z: e.posZ,
    site: e.site,
  }));

  return NextResponse.json({ bombs });
}
