import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { EconomyChart } from "./economy-chart";

interface Props {
  params: Promise<{ matchId: string }>;
}

export default async function EconomyPage({ params }: Props) {
  const { matchId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) notFound();

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

  if (!match) notFound();

  const rounds = match.rounds.map((r) => ({
    round: r.number,
    winner: r.winner as "CT" | "T",
    winReason: r.winReason,
    ctScore: r.ctScore,
    tScore: r.tScore,
    ctEquipVal: r.ctEquipVal,
    tEquipVal: r.tEquipVal,
    ctMoney: r.ctMoney,
    tMoney: r.tMoney,
    buyTypeCT: r.buyType_CT,
    buyTypeT: r.buyType_T,
  }));

  return (
    <EconomyChart
      matchId={matchId}
      mapName={mapDisplayName(match.map)}
      scoreCT={match.scoreCT}
      scoreT={match.scoreT}
      rounds={rounds}
    />
  );
}
