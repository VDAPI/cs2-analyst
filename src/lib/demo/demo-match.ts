/**
 * The public example analysis (S21): one match whose full report anyone can
 * open at /demo without an account. An admin picks it (`AppSetting`
 * `DEMO_MATCH_KEY`): a pro demo, or the owner's own match with their consent.
 * Without a pick, or when the picked analysis is gone, it is the newest
 * analysed demo of the pro pool. No match at all = /demo says so.
 */
import type { PrismaClient } from "@prisma/client";

export const DEMO_MATCH_KEY = "demo:matchId";

/** A match id as Prisma's cuid() writes it. */
export function isMatchId(v: unknown): v is string {
  return typeof v === "string" && /^[a-z0-9]{20,40}$/.test(v);
}

type Db = Pick<PrismaClient, "appSetting" | "demoUpload">;

/** Whether the match has a live, finished analysis (the only kind /demo can show). */
async function isLiveAnalysis(db: Db, matchId: string): Promise<boolean> {
  const upload = await db.demoUpload.findFirst({
    where: { matchId, deletedAt: null, status: "COMPLETED" },
    select: { id: true },
  });
  return upload != null;
}

/** The admin's pick, or null when none is set. */
export async function pickedDemoMatchId(db: Db): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key: DEMO_MATCH_KEY } });
  return row && isMatchId(row.value) ? row.value : null;
}

/** The match /demo shows, or null when there is nothing to show yet. */
export async function getDemoMatchId(db: Db): Promise<string | null> {
  const picked = await pickedDemoMatchId(db);
  if (picked && (await isLiveAnalysis(db, picked))) return picked;
  const pro = await db.demoUpload.findFirst({
    where: { pro: true, deletedAt: null, status: "COMPLETED", matchId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { matchId: true },
  });
  return pro?.matchId ?? null;
}

/** Whether replay data of this match is public because it is the example analysis. */
export async function isDemoMatch(db: Db, matchId: string): Promise<boolean> {
  return (await getDemoMatchId(db)) === matchId;
}

/**
 * Set (or with null clear) the admin's pick. Returns false when the match has
 * no live, finished analysis.
 */
export async function setDemoMatchId(db: Db, matchId: string | null): Promise<boolean> {
  if (matchId == null) {
    await db.appSetting.deleteMany({ where: { key: DEMO_MATCH_KEY } });
    return true;
  }
  if (!(await isLiveAnalysis(db, matchId))) return false;
  await db.appSetting.upsert({
    where: { key: DEMO_MATCH_KEY },
    create: { key: DEMO_MATCH_KEY, value: matchId },
    update: { value: matchId },
  });
  return true;
}
