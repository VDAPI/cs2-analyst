/**
 * What the report shows about round win probability (S14): the player's WPA
 * and which model the "pp" numbers come from. Never throws; without it the
 * report just leaves the numbers out.
 */
import type { PrismaClient } from "@prisma/client";
import type { TFunction } from "@/lib/i18n/translate";
import { getActiveModel, getMatchWpa } from "./persist";

export interface ReportWinProb {
  /** Win probability added per round by the player's kills and deaths, pp; null without replay data. */
  wpaPerRoundPp: number | null;
  trained: boolean;
  nMatches: number;
  t: TFunction;
}

export async function loadReportWinProb(
  prisma: PrismaClient,
  matchId: string,
  steamId: string,
  t: TFunction
): Promise<ReportWinProb | null> {
  try {
    const [model, wpa] = await Promise.all([getActiveModel(prisma), getMatchWpa(prisma, matchId)]);
    const mine = wpa.find((p) => p.steamId === steamId);
    return {
      wpaPerRoundPp: mine && mine.rounds > 0 ? Math.round((mine.total / mine.rounds) * 1000) / 10 : null,
      trained: model.trained,
      nMatches: model.nMatches,
      t,
    };
  } catch (error) {
    console.error(`[winprob] report data failed match=${matchId}:`, error);
    return null;
  }
}

/** Sum of the costs (negative changes) of these findings, pp, one decimal; null when none has one. */
export function totalCostPp(findings: Array<{ wp?: { before: number; after: number } | null }>): number | null {
  let sum = 0;
  let any = false;
  for (const f of findings) {
    if (!f.wp) continue;
    const d = f.wp.after - f.wp.before;
    if (d < 0) {
      sum += d;
      any = true;
    }
  }
  return any ? Math.round(sum * 1000) / 10 : null;
}

/** "−12,4" (Polish decimal comma, explicit sign). */
export const fmtPp = (pp: number) => `${pp > 0 ? "+" : pp < 0 ? "−" : ""}${Math.abs(pp).toFixed(1).replace(".", ",")}`;
