import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getFindings } from "@/lib/findings/persist";
import { loadPlayerReport } from "@/lib/findings/player-report";
import { toFindingView } from "@/lib/findings/view";
import { getLocale } from "@/lib/i18n/server";
import { matchCoachInput, ownedMatchForCoach } from "@/lib/coach/match";
import { loadFeedbackWeights, matchCoachText } from "@/lib/coach/persist";

const schema = z.object({
  matchId: z.string().min(1),
  steamId: z.string().min(1),
  force: z.boolean().optional(),
});

/**
 * POST /api/coach/match — the AI coach's notes on one player of a match
 * (S15): cached while the findings and ratings are unchanged, else written
 * now. Falls back to the standard text (status says why).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { matchId, steamId, force } = body.data;

  const match = await ownedMatchForCoach(prisma, userId, matchId, steamId);
  const player = match?.players[0];
  if (!match || !player) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const locale = await getLocale();
  const all = (await getFindings(prisma, matchId)).map(toFindingView);
  const [{ report, hasData }, weights] = await Promise.all([
    loadPlayerReport(prisma, matchId, steamId, all),
    loadFeedbackWeights(prisma, userId),
  ]);
  if (!hasData) return NextResponse.json({ error: "No report data" }, { status: 404 });

  const facts = matchCoachInput({
    locale,
    report,
    weights,
    match: { map: match.map, scoreCT: match.scoreCT, scoreT: match.scoreT, rounds: match._count.rounds },
    player,
  });
  const result = await matchCoachText(prisma, { userId, matchId, steamId, locale, facts, force });
  return NextResponse.json(result);
}
