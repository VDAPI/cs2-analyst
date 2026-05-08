import type { BuyTypeKey } from "./buyType";

/**
 * Score 0-100 for how aligned a team's buy was on a given round.
 * 100 = all 5 same buy type. Below 60 we flag as "desync".
 *
 * NOTE: utility-buy-rate (smoke + flash count per player on full buys) is
 * deferred until we verify item_purchase event support in @laihoe/demoparser2.
 */
export function teamBuySyncScore(buyTypes: BuyTypeKey[]): number {
  if (buyTypes.length === 0) return 0;
  const counts = new Map<BuyTypeKey, number>();
  for (const bt of buyTypes) {
    counts.set(bt, (counts.get(bt) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  return Math.round((max / buyTypes.length) * 100);
}

export const BUY_SYNC_DESYNC_THRESHOLD = 60;
