/**
 * Learning the order of advice from "helpful / not helpful" ratings (S15).
 *
 * Each rating is about one finding type. A type's weight multiplies the
 * report's issue score, so advice the player found useful moves up and advice
 * they rejected moves down. The player's own ratings count most; everyone's
 * ratings nudge the order a little. Both rates are smoothed towards 50% with a
 * Beta prior, so one click moves an issue a bit and a few consistent clicks
 * move it a lot, never to zero. Pure, covered by `npm run test:coach`.
 */

export interface FeedbackCount {
  type: string;
  helpful: number;
  total: number;
}

/** Beta(a, a) prior: a rate with no ratings is 0.5. */
const USER_PRIOR = 1.5;
const GLOBAL_PRIOR = 10;
/** How strongly a rate away from 50% moves the weight: the player's own ratings, everyone's. */
const USER_SPAN = 1.5;
const GLOBAL_SPAN = 0.3;
export const MIN_WEIGHT = 0.35;
export const MAX_WEIGHT = 1.75;

export function smoothedRate(helpful: number, total: number, prior: number): number {
  return (helpful + prior) / (total + 2 * prior);
}

export type FeedbackWeights = Map<string, number>;

export function feedbackWeights(user: FeedbackCount[], global: FeedbackCount[]): FeedbackWeights {
  const types = new Set([...user.map((c) => c.type), ...global.map((c) => c.type)]);
  const out: FeedbackWeights = new Map();
  for (const type of types) {
    const u = user.find((c) => c.type === type);
    const g = global.find((c) => c.type === type);
    const uRate = u ? smoothedRate(u.helpful, u.total, USER_PRIOR) : 0.5;
    const gRate = g ? smoothedRate(g.helpful, g.total, GLOBAL_PRIOR) : 0.5;
    const w = 1 + USER_SPAN * (uRate - 0.5) + GLOBAL_SPAN * (gRate - 0.5);
    out.set(type, Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, Math.round(w * 1000) / 1000)));
  }
  return out;
}

export function weightOf(weights: FeedbackWeights | null | undefined, type: string): number {
  return weights?.get(type) ?? 1;
}

/** Stable re-rank of scored items by score × weight. */
export function rerank<T extends { type: string; score: number }>(items: T[], weights: FeedbackWeights | null | undefined): T[] {
  return items
    .map((item, i) => ({ item, i, s: item.score * weightOf(weights, item.type) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}
