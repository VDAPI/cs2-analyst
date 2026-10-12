/**
 * The AI coach's storage (S15): the weekly TrainingPlan, the AI texts cached
 * per match / plan and language (CoachText), and the advice ratings
 * (CoachFeedback) that re-rank both. Server-only.
 */
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient, TrainingPlan } from "@prisma/client";
import type { Locale } from "@/lib/i18n/config";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/config";
import { createT } from "@/lib/i18n/translate";
import { loadProgress } from "@/lib/progress/load";
import type { MatchInput } from "@/lib/progress/metrics";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { COACH_PROMPT_VERSION, coachAiEnabled, coachModel, writeMatchText, writePlanText } from "./ai";
import { matchFacts, planFacts, type MatchFactsInput } from "./facts";
import { buildTrainingPlan, PLAN_VERSION, PLAN_WINDOW, weekStartOf, type TrainingPlanContent } from "./plan";
import { feedbackWeights, type FeedbackCount, type FeedbackWeights } from "./ranking";
import { mergeMatchText, mergePlanText, rulesMatchText, rulesPlanText, type CoachMatchText, type CoachPlanText, type CoachStatus } from "./text";
import { hitRateLimit } from "@/lib/security/rate-limit";
export type { CoachStatus };

/** AI texts one user can have written per 24 h (report notes, plans, rewrites). */
export const AI_DAILY_LIMIT = 40;


const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32);

// ─── Feedback ────────────────────────────────────────────

async function counts(prisma: PrismaClient, where: Prisma.CoachFeedbackWhereInput): Promise<FeedbackCount[]> {
  const rows = await prisma.coachFeedback.groupBy({ by: ["type", "helpful"], where, _count: { _all: true } });
  const byType = new Map<string, FeedbackCount>();
  for (const r of rows) {
    const c = byType.get(r.type) ?? { type: r.type, helpful: 0, total: 0 };
    c.total += r._count._all;
    if (r.helpful) c.helpful += r._count._all;
    byType.set(r.type, c);
  }
  return [...byType.values()];
}

export async function loadFeedbackWeights(prisma: PrismaClient, userId: string): Promise<FeedbackWeights> {
  const [user, global] = await Promise.all([counts(prisma, { userId }), counts(prisma, {})]);
  return feedbackWeights(user, global);
}

/** The user's ratings in one context, type → helpful. */
export async function loadRatings(prisma: PrismaClient, userId: string, context: string): Promise<Record<string, boolean>> {
  const rows = await prisma.coachFeedback.findMany({ where: { userId, context }, select: { type: true, helpful: true } });
  return Object.fromEntries(rows.map((r) => [r.type, r.helpful]));
}

// ─── AI text cache ───────────────────────────────────────

const inflight = new Map<string, Promise<unknown>>();

interface CachedAiOptions<F, T> {
  userId: string;
  key: string;
  locale: Locale;
  facts: F;
  write: (facts: F) => Promise<{ text: T; model: string; rejected: number } | null>;
  matchId?: string;
  planId?: string;
  /** Write again even when the cached text still matches the facts. */
  force?: boolean;
  /** Only read the cache, never call the API (page render). */
  cacheOnly?: boolean;
}

/** The AI text for these facts: cached when the facts are unchanged, else written now (within the daily limit). */
async function cachedAi<F, T>(prisma: PrismaClient, o: CachedAiOptions<F, T>): Promise<{ text: T | null; status: CoachStatus }> {
  const factsHash = hash({ v: COACH_PROMPT_VERSION, model: coachModel(), facts: o.facts });
  const where = { userId_key_locale: { userId: o.userId, key: o.key, locale: o.locale } };
  const existing = await prisma.coachText.findUnique({ where });
  if (existing && existing.factsHash === factsHash && !o.force) return { text: existing.content as T, status: "ai" };
  if (!coachAiEnabled()) return { text: null, status: "off" };
  if (o.cacheOnly) return { text: null, status: "pending" };

  const since = new Date(Date.now() - 24 * 3600_000);
  if ((await prisma.coachText.count({ where: { userId: o.userId, updatedAt: { gte: since } } })) >= AI_DAILY_LIMIT) {
    return { text: null, status: "limit" };
  }

  const lock = `${o.userId}:${o.key}:${o.locale}`;
  const running = inflight.get(lock);
  if (running) {
    await running.catch(() => undefined);
    const row = await prisma.coachText.findUnique({ where });
    return row && row.factsHash === factsHash ? { text: row.content as T, status: "ai" } : { text: null, status: "failed" };
  }
  // Every model call counts, whatever happens to its text (S29).
  if (!(await hitRateLimit("coachAiDaily", o.userId)).allowed) return { text: null, status: "limit" };
  const job = (async () => {
    const res = await o.write(o.facts);
    if (!res) return null;
    const data = {
      factsHash,
      model: res.model,
      rejected: res.rejected,
      content: res.text as unknown as Prisma.InputJsonValue,
      matchId: o.matchId ?? null,
      planId: o.planId ?? null,
    };
    await prisma.coachText.upsert({
      where,
      create: { userId: o.userId, key: o.key, locale: o.locale, ...data },
      update: data,
    });
    return res.text;
  })();
  inflight.set(lock, job);
  try {
    const text = await job;
    return text ? { text, status: "ai" } : { text: null, status: "failed" };
  } catch (error) {
    console.error(`[coach] AI text failed key=${o.key}`, error);
    return { text: null, status: "failed" };
  } finally {
    inflight.delete(lock);
  }
}

// ─── Match notes ─────────────────────────────────────────

export async function matchCoachText(
  prisma: PrismaClient,
  o: { userId: string; matchId: string; steamId: string; locale: Locale; facts: MatchFactsInput; force?: boolean; cacheOnly?: boolean }
): Promise<{ text: CoachMatchText; status: CoachStatus }> {
  const t = createT(o.locale);
  const rules = rulesMatchText(
    o.facts.issues.map((i) => i.type),
    o.locale,
    t
  );
  if (o.facts.issues.length === 0) return { text: rules, status: "none" };
  const ai = await cachedAi(prisma, {
    userId: o.userId,
    key: `match:${o.matchId}:${o.steamId}`,
    locale: o.locale,
    facts: matchFacts(o.facts),
    write: writeMatchText,
    matchId: o.matchId,
    force: o.force,
    cacheOnly: o.cacheOnly,
  });
  return { text: mergeMatchText(rules, ai.text), status: ai.status };
}

// ─── Weekly plan ─────────────────────────────────────────

/**
 * This week's plan for the player, rebuilt when their matches, findings or
 * ratings changed. Ticked-off days are kept while the player stays the same.
 */
export async function upsertWeeklyPlan(
  prisma: PrismaClient,
  o: { userId: string; steamId: string; matches: MatchInput[]; now?: Date }
): Promise<{ row: TrainingPlan; content: TrainingPlanContent }> {
  const weekStart = weekStartOf(o.now ?? new Date());
  const ids = o.matches.map((m) => m.matchId);
  const [findings, weights, existing] = await Promise.all([
    prisma.finding.findMany({
      where: { matchId: { in: ids }, steamId: o.steamId },
      select: { id: true, matchId: true, steamId: true, type: true, severity: true, costly: true, roundNumber: true, tick: true },
    }),
    loadFeedbackWeights(prisma, o.userId),
    prisma.trainingPlan.findUnique({ where: { userId_weekStart: { userId: o.userId, weekStart } } }),
  ]);
  const content = buildTrainingPlan({ weekStart, matches: o.matches, findings, weights });
  const factsHash = hash(content);
  if (existing && existing.factsHash === factsHash && existing.steamId === o.steamId) return { row: existing, content };
  const json = content as unknown as Prisma.InputJsonValue;
  const row = await prisma.trainingPlan.upsert({
    where: { userId_weekStart: { userId: o.userId, weekStart } },
    create: { userId: o.userId, steamId: o.steamId, weekStart, factsHash, content: json },
    update: {
      steamId: o.steamId,
      factsHash,
      content: json,
      ...(existing && existing.steamId !== o.steamId ? { doneDays: [] } : {}),
    },
  });
  return { row, content };
}

export function planContent(row: Pick<TrainingPlan, "content">): TrainingPlanContent | null {
  const c = row.content as unknown as TrainingPlanContent | null;
  return c && c.version === PLAN_VERSION && Array.isArray(c.focuses) && Array.isArray(c.days) ? c : null;
}

export async function planCoachText(
  prisma: PrismaClient,
  o: { userId: string; row: TrainingPlan; content: TrainingPlanContent; locale: Locale; force?: boolean; cacheOnly?: boolean }
): Promise<{ text: CoachPlanText; status: CoachStatus }> {
  const rules = rulesPlanText(o.content, o.locale, createT(o.locale));
  if (o.content.focuses.length === 0) return { text: rules, status: "none" };
  const ai = await cachedAi(prisma, {
    userId: o.userId,
    key: `plan:${o.row.id}`,
    locale: o.locale,
    facts: planFacts(o.content, {
      locale: o.locale,
      playerName: o.content.player ?? "",
      mapName: o.content.map ? mapDisplayName(o.content.map) : null,
    }),
    write: writePlanText,
    planId: o.row.id,
    force: o.force,
    cacheOnly: o.cacheOnly,
  });
  return { text: mergePlanText(rules, ai.text), status: ai.status };
}

/**
 * After an analysis finishes (workers): rebuild the uploader's plan for this
 * week and, with the API on, have the coach write it in their language, so
 * the plan with targets is ready when they open it. Never throws.
 */
export async function refreshPlanAfterAnalysis(prisma: PrismaClient, uploadId: string): Promise<void> {
  try {
    const upload = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { status: true, deletedAt: true, user: { select: { id: true, steamId: true, faceitNickname: true, locale: true } } },
    });
    if (!upload || upload.deletedAt || upload.status !== "COMPLETED") return;
    const user = upload.user;
    const data = await loadProgress(prisma, {
      userId: user.id,
      sessionSteamId: user.steamId,
      faceitNickname: user.faceitNickname,
      limit: PLAN_WINDOW,
    });
    if (!data.steamId || data.matches.length === 0) return;
    const { row, content } = await upsertWeeklyPlan(prisma, { userId: user.id, steamId: data.steamId, matches: data.matches });
    const locale = isLocale(user.locale) ? user.locale : DEFAULT_LOCALE;
    await planCoachText(prisma, { userId: user.id, row, content, locale });
  } catch (error) {
    console.error(`[coach] plan refresh failed uploadId=${uploadId}`, error);
  }
}
