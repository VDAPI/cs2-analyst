import { NextResponse } from "next/server";
import { getMatchAccess, roundAllowed } from "@/lib/sharing/access";
import { prisma } from "@/lib/db/prisma";
import { buildRoundContext } from "@/lib/winprob/features";
import { getActiveModel, loadWinProbMatch } from "@/lib/winprob/persist";
import { roundSeries } from "@/lib/winprob/series";

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/winprob?round=1
 *
 * The round's win probability over time (P(CT) every half second) and its
 * jumps at kills, the plant and the defuse (S14), for the replay strip.
 * `series` is null when the round has no replay data.
 */
export async function GET(req: Request, { params }: Props) {
  const { matchId } = await params;
  const access = await getMatchAccess(req, matchId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const round = parseInt(new URL(req.url).searchParams.get("round") ?? "1", 10);
  if (!Number.isFinite(round) || round < 1 || !roundAllowed(access, round)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [match, model] = await Promise.all([
    loadWinProbMatch(prisma, matchId, { rounds: [round] }),
    getActiveModel(prisma),
  ]);
  const r = match?.rounds[0];
  if (!match || !r) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const series = roundSeries(buildRoundContext(r, match.tickRate, match.sites), model.spec);
  return NextResponse.json({
    model: { id: model.id, kind: model.kind, trained: model.trained },
    series,
  });
}
