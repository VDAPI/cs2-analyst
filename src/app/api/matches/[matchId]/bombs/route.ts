import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const url = new URL(req.url);
  const roundNum = parseInt(url.searchParams.get("round") ?? "1", 10);

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
