/**
 * Prices of the paid plans (S30). The one place to change them: amounts are
 * in cents, a yearly plan costs ten months. Stripe prices are created from
 * these numbers on the first checkout (lookup key `cs2a_<plan>_<interval>_<amount>`,
 * so a new amount makes a new price and old subscribers keep theirs), unless
 * `STRIPE_PRICE_<PLAN>_<INTERVAL>` names a price made in the Stripe dashboard.
 *
 * Pure: no Stripe or DB access.
 */
import type { Plan } from "@prisma/client";

export type PaidPlan = Exclude<Plan, "FREE">;
export type BillingInterval = "month" | "year";

export const PAID_PLANS: PaidPlan[] = ["PRO", "TEAM"];
export const BILLING_INTERVALS: BillingInterval[] = ["month", "year"];

export const BILLING_CURRENCY = "usd";

/** Monthly price in cents. */
export const MONTHLY_PRICE: Record<PaidPlan, number> = {
  PRO: 600,
  TEAM: 1500,
};

/** Months charged for a year (two months free). */
export const YEAR_MONTHS = 10;

/** Accounts a Team subscription covers: the owner plus the earliest members of their teams (Pro limits). */
export const TEAM_SEATS = 5;

/** Order of plans, for "highest plan wins". */
export const PLAN_RANK: Record<Plan, number> = { FREE: 0, PRO: 1, TEAM: 2 };

export function isPaidPlan(v: unknown): v is PaidPlan {
  return v === "PRO" || v === "TEAM";
}

export function isBillingInterval(v: unknown): v is BillingInterval {
  return v === "month" || v === "year";
}

/** Amount charged per interval, in cents. */
export function priceAmount(plan: PaidPlan, interval: BillingInterval): number {
  return interval === "year" ? MONTHLY_PRICE[plan] * YEAR_MONTHS : MONTHLY_PRICE[plan];
}

/** Lookup key of the Stripe price made from these numbers. */
export function priceLookupKey(plan: PaidPlan, interval: BillingInterval): string {
  return `cs2a_${plan.toLowerCase()}_${interval}_${priceAmount(plan, interval)}`;
}

/** Inverse of priceLookupKey (any amount), for subscriptions without our metadata. */
export function parseLookupKey(key: string | null | undefined): { plan: PaidPlan; interval: BillingInterval } | null {
  const m = /^cs2a_(pro|team)_(month|year)_\d+$/.exec(key ?? "");
  if (!m) return null;
  return { plan: m[1].toUpperCase() as PaidPlan, interval: m[2] as BillingInterval };
}

/** Env var that may hold a dashboard-made Stripe price id for this plan. */
export function priceEnvName(plan: PaidPlan, interval: BillingInterval): string {
  return `STRIPE_PRICE_${plan}_${interval === "month" ? "MONTHLY" : "YEARLY"}`;
}

/** "6", "60", "15.50" — cents to a display amount without trailing zeros. */
export function formatAmount(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** "$6", "€12.50" — for prices and invoices. */
export function formatMoney(cents: number, currency: string = BILLING_CURRENCY): string {
  const symbol: Record<string, string> = { usd: "$", eur: "€", gbp: "£" };
  const s = symbol[currency.toLowerCase()];
  return s ? `${s}${formatAmount(cents)}` : `${formatAmount(cents)} ${currency.toUpperCase()}`;
}

/** Percent saved by paying yearly (rounded). */
export function yearlySavingPercent(plan: PaidPlan): number {
  return Math.round((1 - priceAmount(plan, "year") / (MONTHLY_PRICE[plan] * 12)) * 100);
}
