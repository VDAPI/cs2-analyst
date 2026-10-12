/**
 * What the report shows about round win probability (S14): the player's WPA
 * and which model the "pp" numbers come from. Never throws; without it the
 * report just leaves the numbers out.
 */
import type { PrismaClient } from "@prisma/client";
import type { TFunction } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/config";
import { fmtPp as fmtPpLocale } from "./format";
import { getActiveModel, getMatchWpa } from "./persist";

export interface ReportWinProb {
  /** Win probability added per round by the player's kills and deaths, pp; null without replay data. */
  wpaPerRoundPp: number | null;
  trained: boolean;
  nMatches: number;
  t: TFunction;
  /** "−12,4" in the reader's language. */
  fmt: (pp: number) => string;
}

export async function loadReportWinProb(
  prisma: PrismaClient,
  matchId: string,
  steamId: string,
  t: TFunction,
  locale: Locale
): Promise<ReportWinProb | null> {
  try {
    const [model, wpa] = await Promise.all([getActiveModel(prisma), getMatchWpa(prisma, matchId)]);
    const mine = wpa.find((p) => p.steamId === steamId);
    return {
      wpaPerRoundPp: mine && mine.rounds > 0 ? Math.round((mine.total / mine.rounds) * 1000) / 10 : null,
      trained: model.trained,
      nMatches: model.nMatches,
      t,
      fmt: (pp: number) => fmtPpLocale(pp, locale),
    };
  } catch (error) {
    console.error(`[winprob] report data failed match=${matchId}:`, error);
    return null;
  }
}

/**
 * Sum of the costs (negative changes) of these findings, pp, one decimal; null
 * when none has one. Several findings on one death (a moving shot, no trade,
 * a post-plant death…) carry the same cost: it is counted once.
 */
export function totalCostPp(
  findings: Array<{ roundNumber: number; wp?: { before: number; after: number; kind: string } | null }>
): number | null {
  let sum = 0;
  let any = false;
  const seen = new Set<string>();
  for (const f of findings) {
    if (!f.wp) continue;
    const d = f.wp.after - f.wp.before;
    if (d >= 0) continue;
    const key = `${f.roundNumber}|${f.wp.kind}|${f.wp.before}|${f.wp.after}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sum += d;
    any = true;
  }
  return any ? Math.round(sum * 1000) / 10 : null;
}
