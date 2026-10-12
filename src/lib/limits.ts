/**
 * Plan-based usage limits.
 *
 * Shared by the manual upload route, the FACEIT download routes and the
 * "keep demo" toggle so every entry point enforces the same numbers.
 */
import type { Plan, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { effectivePlan, teamSeatPlan } from "@/lib/billing/state";

/** The app client, or the transaction of withUploadSlots(). */
type Db = PrismaClient | Prisma.TransactionClient;

export interface PlanLimits {
  /** Demos a user may analyze per calendar month. */
  monthlyDemos: number;
  /** Analyses that may keep their .dem ("keep demo") at the same time. */
  keptDemos: number;
  /** Matches "Analyze selected" may queue in one go. */
  batchSize: number;
  /** Files the upload page accepts in one go. */
  uploadFiles: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: { monthlyDemos: 10, keptDemos: 3, batchSize: 5, uploadFiles: 5 },
  PRO: { monthlyDemos: 100, keptDemos: 50, batchSize: 20, uploadFiles: 20 },
  TEAM: {
    monthlyDemos: Number.POSITIVE_INFINITY,
    keptDemos: 200,
    batchSize: 50,
    uploadFiles: 50,
  },
};

/**
 * Monthly demo limit for a user: the admin panel's per-user override when set,
 * otherwise the plan's default.
 */
export function effectiveMonthlyLimit(plan: Plan, override: number | null): number {
  return override != null && override >= 0 ? override : PLAN_LIMITS[plan].monthlyDemos;
}

export function startOfMonthUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** How many of `wanted` items fit in what is left this month and in one batch. */
export function allowedBatch(wanted: number, remaining: number, batchSize: number): number {
  return Math.max(0, Math.min(wanted, remaining, batchSize));
}

export interface DemoLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  plan: Plan;
}

export interface PlanUsage extends DemoLimitStatus {
  limits: PlanLimits;
  keptDemos: number;
}

/**
 * Count a user's demos created this calendar month (excluding failed ones)
 * and compare against their plan limit. Both MANUAL and FACEIT uploads count,
 * and so do analyses the user deleted since.
 */
export async function checkMonthlyDemoLimit(userId: string, db: Db = prisma): Promise<DemoLimitStatus> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { plan: true, monthlyDemoLimit: true },
  });
  const plan: Plan = effectivePlan(user?.plan ?? "FREE", await teamSeatFor(userId, db));
  const limit = effectiveMonthlyLimit(plan, user?.monthlyDemoLimit ?? null);

  const used = await db.demoUpload.count({
    where: {
      userId,
      createdAt: { gte: startOfMonthUTC() },
      status: { not: "FAILED" },
    },
  });

  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used), plan };
}

/**
 * Pro limits from a teammate's Team subscription (S30): the plan of a seat
 * in a team whose owner is on the TEAM plan, null when there is none.
 */
export async function teamSeatFor(userId: string, db: Db = prisma): Promise<Plan | null> {
  const teams = await db.team.findMany({
    where: {
      members: { some: { userId } },
      AND: { members: { some: { role: "OWNER", user: { plan: "TEAM" } } } },
    },
    select: { members: { select: { userId: true, joinedAt: true, role: true, user: { select: { plan: true } } } } },
    take: 10,
  });
  return teamSeatPlan(
    userId,
    teams.flatMap((t) => {
      const owner = t.members.find((m) => m.role === "OWNER");
      return owner ? [{ ownerId: owner.userId, ownerPlan: owner.user.plan, members: t.members }] : [];
    })
  );
}

/** Everything the UI shows about the plan: monthly usage and kept demos. */
export async function getPlanUsage(userId: string, db: Db = prisma): Promise<PlanUsage> {
  const status = await checkMonthlyDemoLimit(userId, db);
  const keptDemos = await db.demoUpload.count({
    where: { userId, keepDemo: true, deletedAt: null, demoDeletedAt: null },
  });
  return { ...status, limits: { ...PLAN_LIMITS[status.plan], monthlyDemos: status.limit }, keptDemos };
}

/**
 * How many more analyses may keep their .dem. Rows still in flight with
 * "keep demo" count already (getPlanUsage counts every non-deleted one).
 */
export function keepDemoSlotsLeft(usage: PlanUsage): number {
  return Math.max(0, usage.limits.keptDemos - usage.keptDemos);
}

/**
 * Check the plan and create the upload row(s) as one step per user. Counting
 * and creating separately let parallel requests all see the same free slot
 * and go past the monthly (or "keep demo") limit. `fn` gets the usage counted
 * under a per-user advisory lock and must create its DemoUpload rows through
 * `tx`; the lock is held until they are committed. Keep slow work (file
 * writes, queueing jobs) outside `fn`.
 */
export async function withUploadSlots<T>(
  userId: string,
  fn: (tx: Prisma.TransactionClient, usage: PlanUsage) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`uploads:${userId}`}))`;
      return fn(tx, await getPlanUsage(userId, tx));
    },
    { timeout: 15_000 }
  );
}

export function formatLimit(n: number): string {
  return Number.isFinite(n) ? String(n) : "∞";
}

export function limitReachedMessage(s: DemoLimitStatus): string {
  return `Monthly demo limit reached (${s.used}/${formatLimit(s.limit)} on ${s.plan} plan). Upgrade for more.`;
}
