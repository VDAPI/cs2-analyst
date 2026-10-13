/**
 * What the pricing cards show for each plan (S30), from PLAN_LIMITS and the
 * prices, so a change to either shows up on /pricing and /billing by itself.
 * Pure and serialisable (passed to client components).
 */
import type { Plan } from "@prisma/client";
import { PLAN_LIMITS } from "@/lib/limits";
import { priceAmount, TEAM_SEATS, yearlySavingPercent, type BillingInterval } from "./prices";

export interface PlanOffer {
  plan: Plan;
  /** Cents per interval; 0 for Free. */
  price: Record<BillingInterval, number>;
  /** Percent saved yearly (0 for Free). */
  yearlySave: number;
  /** null = unlimited. */
  monthlyDemos: number | null;
  keptDemos: number;
  batchSize: number;
  uploadFiles: number;
  /** Extra accounts with Pro limits (Team only). */
  seats: number;
  highlight: boolean;
}

export function planOffers(): PlanOffer[] {
  const plans: Plan[] = ["FREE", "PRO", "TEAM"];
  return plans.map((plan) => {
    const l = PLAN_LIMITS[plan];
    const paid = plan !== "FREE";
    return {
      plan,
      price: {
        month: paid ? priceAmount(plan, "month") : 0,
        year: paid ? priceAmount(plan, "year") : 0,
      },
      yearlySave: paid ? yearlySavingPercent(plan) : 0,
      monthlyDemos: Number.isFinite(l.monthlyDemos) ? l.monthlyDemos : null,
      keptDemos: l.keptDemos,
      batchSize: l.batchSize,
      uploadFiles: l.uploadFiles,
      seats: plan === "TEAM" ? TEAM_SEATS - 1 : 0,
      highlight: plan === "PRO",
    };
  });
}
