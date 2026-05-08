import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { playerSideAtRound } from "@/lib/utils/sideSplit";
import { teamBuySyncScore } from "@/lib/utils/buySync";
import type { BuyTypeKey } from "@/lib/utils/buyType";
import { EconomyChart } from "./economy-chart";
import {
  BuyCoordinationGrid,
  type PlayerRow,
} from "@/components/charts/buy-coordination-grid";

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
      players: {
        select: { steamId: true, name: true, team: true },
      },
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
          players: {
            select: { steamId: true, buyType: true },
          },
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

  // Build coordination grid data
  const roundNumbers = match.rounds.map((r) => r.number);
  const ctRows: PlayerRow[] = [];
  const tRows: PlayerRow[] = [];
  const ctSyncByRound: Record<number, number> = {};
  const tSyncByRound: Record<number, number> = {};

  for (const mp of match.players) {
    const cells: { round: number; buyType: BuyTypeKey }[] = [];
    for (const round of match.rounds) {
      const rp = round.players.find((p) => p.steamId === mp.steamId);
      cells.push({
        round: round.number,
        buyType: (rp?.buyType ?? "UNKNOWN") as BuyTypeKey,
      });
    }
    // Determine the player's MAJORITY side across the match (for grid layout grouping).
    // We split CT/T by MatchPlayer.team — second half side. Acceptable for visualization.
    const row: PlayerRow = { steamId: mp.steamId, name: mp.name, cells };
    if (mp.team === "CT") ctRows.push(row);
    else tRows.push(row);
  }

  // Per-round per-side sync scores. Use playerSideAtRound to assign each
  // player's actual in-game side at that round.
  for (const round of match.rounds) {
    const ctBuys: BuyTypeKey[] = [];
    const tBuys: BuyTypeKey[] = [];
    for (const rp of round.players) {
      const mp = match.players.find((p) => p.steamId === rp.steamId);
      if (!mp) continue;
      const side = playerSideAtRound(mp.team as "CT" | "T", round.number);
      const bt = (rp.buyType ?? "UNKNOWN") as BuyTypeKey;
      if (side === "CT") ctBuys.push(bt);
      else tBuys.push(bt);
    }
    ctSyncByRound[round.number] = teamBuySyncScore(ctBuys);
    tSyncByRound[round.number] = teamBuySyncScore(tBuys);
  }

  const ctAvgSync =
    roundNumbers.length > 0
      ? Math.round(
          roundNumbers.reduce((s, n) => s + (ctSyncByRound[n] ?? 0), 0) /
            roundNumbers.length
        )
      : 0;
  const tAvgSync =
    roundNumbers.length > 0
      ? Math.round(
          roundNumbers.reduce((s, n) => s + (tSyncByRound[n] ?? 0), 0) /
            roundNumbers.length
        )
      : 0;

  return (
    <div className="space-y-6">
      <EconomyChart
        matchId={matchId}
        mapName={mapDisplayName(match.map)}
        scoreCT={match.scoreCT}
        scoreT={match.scoreT}
        rounds={rounds}
      />
      <BuyCoordinationGrid
        rounds={roundNumbers}
        ctRows={ctRows}
        tRows={tRows}
        ctSyncByRound={ctSyncByRound}
        tSyncByRound={tSyncByRound}
        ctAvgSync={ctAvgSync}
        tAvgSync={tAvgSync}
      />
    </div>
  );
}
