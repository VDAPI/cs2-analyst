import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/matches/[matchId]/economy
 *
 * Returns per-round economy data for the economy chart.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;

  const match = await prisma.match.findFirst({
    where: { id: matchId, upload: { userId: session.user.id } },
    select: {
      id: true,
      map: true,
      scoreCT: true,
      scoreT: true,
      rounds: {
        select: {
          number: true,
          winner: true,
          winReason: true,
          ctScore: true,
          tScore: true,
          ctEquipVal: true,
          tEquipVal: true,
          ctMoney: true,
          tMoney: true,
          buyType_CT: true,
          buyType_T: true,
        },
        orderBy: { number: "asc" },
      },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    matchId: match.id,
    map: match.map,
    scoreCT: match.scoreCT,
    scoreT: match.scoreT,
    rounds: match.rounds.map((r) => ({
      round: r.number,
      winner: r.winner,
      winReason: r.winReason,
      ctScore: r.ctScore,
      tScore: r.tScore,
      ctEquipVal: r.ctEquipVal,
      tEquipVal: r.tEquipVal,
      ctMoney: r.ctMoney,
      tMoney: r.tMoney,
      buyTypeCT: r.buyType_CT,
      buyTypeT: r.buyType_T,
    })),
  });
}
