/**
 * Plan-based usage limits.
 *
 * Shared by the manual upload route and the FACEIT download route so both
 * enforce the same monthly demo quota.
 */
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Max demos a user may add per calendar month, by plan. */
export const MONTHLY_DEMO_LIMIT: Record<Plan, number> = {
  FREE: 10,
  PRO: 100,
  TEAM: Number.POSITIVE_INFINITY,
};

function startOfMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface DemoLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  plan: Plan;
}

/**
 * Count a user's demos created this calendar month (excluding failed ones)
 * and compare against their plan limit. Both MANUAL and FACEIT uploads count.
 */
export async function checkMonthlyDemoLimit(
  userId: string
): Promise<DemoLimitStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const plan: Plan = user?.plan ?? "FREE";
  const limit = MONTHLY_DEMO_LIMIT[plan];

  const used = await prisma.demoUpload.count({
    where: {
      userId,
      createdAt: { gte: startOfMonthUTC() },
      status: { not: "FAILED" },
    },
  });

  return { allowed: used < limit, used, limit, plan };
}
