/**
 * DB reads for the admin panel (server only).
 */
import type { ParseStatus, Plan, Prisma, UploadSource, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { effectiveMonthlyLimit, formatLimit, PLAN_LIMITS, startOfMonthUTC } from "@/lib/limits";
import { dailyCounts, dayKey, isStuck, parseTimeSummary, STUCK_AFTER_MS, type DailyCount, type ParseTimeSummary } from "./metrics";

const DAY_MS = 86_400_000;
export const METRIC_DAYS = 30;

const IN_FLIGHT: ParseStatus[] = ["QUEUED", "DOWNLOADING", "PARSING"];

function stuckWhere(now: Date): Prisma.DemoUploadWhereInput {
  return {
    deletedAt: null,
    status: { in: IN_FLIGHT },
    updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
  };
}

export interface AdminOverview {
  users: { total: number; new7d: number; admins: number };
  analyses: {
    today: number;
    last7d: number;
    failed7d: number;
    stuck: number;
    daily: DailyCount[];
  };
  parse7d: ParseTimeSummary;
  parse30d: ParseTimeSummary;
}

export async function getAdminOverview(now: Date = new Date()): Promise<AdminOverview> {
  const since30 = new Date(now.getTime() - (METRIC_DAYS + 1) * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);

  const [total, new7d, admins, recent, stuck] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since7 } } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.demoUpload.findMany({
      // Uploads cancelled before they finished keep their in-flight status
      // forever; leave them out (finished analyses deleted later still count).
      where: {
        createdAt: { gte: since30 },
        OR: [{ deletedAt: null }, { status: { notIn: IN_FLIGHT } }],
      },
      select: { createdAt: true, status: true, parseMs: true },
    }),
    prisma.demoUpload.count({ where: stuckWhere(now) }),
  ]);

  const daily = dailyCounts(recent, METRIC_DAYS, now);
  const todayKey = dayKey(now);
  const in7 = recent.filter((u) => u.createdAt >= since7);
  const parseMs = (rows: typeof recent) =>
    rows.filter((u) => u.status === "COMPLETED" && u.parseMs != null).map((u) => u.parseMs as number);

  return {
    users: { total, new7d, admins },
    analyses: {
      today: recent.filter((u) => dayKey(u.createdAt) === todayKey).length,
      last7d: in7.length,
      failed7d: in7.filter((u) => u.status === "FAILED").length,
      stuck,
      daily,
    },
    parse7d: parseTimeSummary(parseMs(in7)),
    parse30d: parseTimeSummary(parseMs(recent)),
  };
}

export type AdminUploadFilter = "failed" | "stuck" | "all";

export interface AdminUploadRow {
  id: string;
  fileName: string;
  source: UploadSource;
  status: ParseStatus;
  stuck: boolean;
  error: string | null;
  map: string | null;
  matchId: string | null;
  parseMs: number | null;
  retries: number;
  /** The .dem is still stored, or FACEIT / Valve's replay link can download it again. */
  retryable: boolean;
  createdAt: string;
  updatedAt: string;
  user: { id: string; label: string };
}

export async function getAdminUploads(
  filter: AdminUploadFilter,
  take = 100,
  now: Date = new Date()
): Promise<AdminUploadRow[]> {
  const where: Prisma.DemoUploadWhereInput =
    filter === "failed"
      ? { deletedAt: null, status: "FAILED" }
      : filter === "stuck"
        ? stuckWhere(now)
        : { deletedAt: null };

  const rows = await prisma.demoUpload.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      user: { select: { id: true, email: true, name: true, faceitNickname: true } },
      match: { select: { map: true } },
      steamMatch: { select: { demoUrl: true, userId: true } },
    },
  });

  const faceitDownloads = Boolean(process.env.FACEIT_DOWNLOADS_API_KEY);
  return rows.map((u) => ({
    id: u.id,
    fileName: u.fileName,
    source: u.source,
    status: u.status,
    stuck: isStuck(u, now),
    error: u.error,
    map: u.match?.map ?? null,
    matchId: u.matchId,
    parseMs: u.parseMs,
    retries: u.retries,
    // Same paths as retryUpload().
    retryable:
      Boolean(u.fileUrl && !u.demoDeletedAt) ||
      Boolean(u.faceitMatchId && faceitDownloads) ||
      Boolean(u.steamMatch?.demoUrl && u.steamMatch.userId === u.userId),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
    user: {
      id: u.user.id,
      label: u.user.email ?? u.user.faceitNickname ?? u.user.name ?? u.user.id,
    },
  }));
}

export async function countAdminUploads(now: Date = new Date()) {
  const [failed, stuck] = await Promise.all([
    prisma.demoUpload.count({ where: { deletedAt: null, status: "FAILED" } }),
    prisma.demoUpload.count({ where: stuckWhere(now) }),
  ]);
  return { failed, stuck };
}

export interface AdminUserRow {
  id: string;
  label: string;
  email: string | null;
  faceitNickname: string | null;
  steamLinked: boolean;
  plan: Plan;
  role: UserRole;
  monthlyDemoLimit: number | null;
  /** Limit in force: the override, or the plan default (null = no limit). */
  effectiveLimit: number | null;
  usedThisMonth: number;
  totalAnalyses: number;
  failedAnalyses: number;
  createdAt: string;
}

function finiteOrNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

/** Plan default monthly limit as shown in the editor ("10", "∞"). */
export function planLimitLabels(): Record<Plan, string> {
  return {
    FREE: formatLimit(PLAN_LIMITS.FREE.monthlyDemos),
    PRO: formatLimit(PLAN_LIMITS.PRO.monthlyDemos),
    TEAM: formatLimit(PLAN_LIMITS.TEAM.monthlyDemos),
  };
}

export async function getAdminUsers(query: string, take = 200): Promise<AdminUserRow[]> {
  const q = query.trim();
  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { faceitNickname: { contains: q, mode: "insensitive" } },
            { steamId: q },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      email: true,
      name: true,
      faceitNickname: true,
      steamId: true,
      plan: true,
      role: true,
      monthlyDemoLimit: true,
      createdAt: true,
    },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return [];

  const [month, all] = await Promise.all([
    // Same rule as checkMonthlyDemoLimit: this calendar month, failed ones excluded.
    prisma.demoUpload.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, createdAt: { gte: startOfMonthUTC() }, status: { not: "FAILED" } },
      _count: { _all: true },
    }),
    prisma.demoUpload.groupBy({
      by: ["userId", "status"],
      where: { userId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const used = new Map(month.map((r) => [r.userId, r._count._all]));
  const totals = new Map<string, { total: number; failed: number }>();
  for (const r of all) {
    const t = totals.get(r.userId) ?? { total: 0, failed: 0 };
    t.total += r._count._all;
    if (r.status === "FAILED") t.failed += r._count._all;
    totals.set(r.userId, t);
  }

  return users.map((u) => ({
    id: u.id,
    label: u.email ?? u.faceitNickname ?? u.name ?? u.id,
    email: u.email,
    faceitNickname: u.faceitNickname,
    steamLinked: Boolean(u.steamId),
    plan: u.plan,
    role: u.role,
    monthlyDemoLimit: u.monthlyDemoLimit,
    effectiveLimit: finiteOrNull(effectiveMonthlyLimit(u.plan, u.monthlyDemoLimit)),
    usedThisMonth: used.get(u.id) ?? 0,
    totalAnalyses: totals.get(u.id)?.total ?? 0,
    failedAnalyses: totals.get(u.id)?.failed ?? 0,
    createdAt: u.createdAt.toISOString(),
  }));
}
