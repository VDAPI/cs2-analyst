import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/kills?round=1
 *
 * Returns kill events for a round (used by replay viewer for kill markers).
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
