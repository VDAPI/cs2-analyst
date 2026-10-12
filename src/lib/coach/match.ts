/**
 * What the coach needs about one player of one match (S15): their report's
 * issues re-ranked by the user's ratings, their strengths and the score from
 * their side. Shared by the report page and /api/coach/match. Server-only.
 */
import type { PrismaClient } from "@prisma/client";
import { isActionable, type PlayerReport } from "@/lib/findings/report";
import type { FindingView } from "@/lib/findings/view";
import type { Locale } from "@/lib/i18n/config";
import { mapDisplayName } from "@/lib/utils/mapNames";
import type { MatchFactsInput } from "./facts";
import { pickFocuses } from "./plan";
import type { FeedbackWeights } from "./ranking";

export function matchCoachInput(o: {
  locale: Locale;
  report: PlayerReport<FindingView>;
  weights: FeedbackWeights;
  match: { map: string; scoreCT: number; scoreT: number; rounds: number };
  player: { name: string; team: string };
}): MatchFactsInput {
  const own = o.player.team === "T" ? o.match.scoreT : o.match.scoreCT;
  const opp = o.player.team === "T" ? o.match.scoreCT : o.match.scoreT;
  return {
    locale: o.locale,
    map: mapDisplayName(o.match.map),
    playerName: o.player.name,
    score: { own, opp },
    rounds: o.match.rounds,
    issues: pickFocuses(o.report.issues.filter(isActionable), o.weights),
    strengths: o.report.strengths,
  };
}

/** The uploader's match with the player row, or null when it isn't theirs. */
export async function ownedMatchForCoach(prisma: PrismaClient, userId: string, matchId: string, steamId: string) {
  return prisma.match.findFirst({
    where: { id: matchId, upload: { userId } },
    select: {
      id: true,
      map: true,
      scoreCT: true,
      scoreT: true,
      _count: { select: { rounds: true } },
      players: { where: { steamId }, select: { steamId: true, name: true, team: true } },
    },
  });
}
