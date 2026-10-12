import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { backfillWinProb, clearModelCache } from "@/lib/winprob/persist";
import { requestTraining } from "@/lib/winprob/train-trigger";

/**
 * POST /api/admin/ml { action: "train" | "backfill" }
 *
 * train: retrain the win-probability model now (the ML service, or the local
 * Python trainer), even without new matches. backfill: store snapshots and
 * pro situations for up to 50 matches that have none.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "backfill") {
    const done = await backfillWinProb(prisma, { limit: 50 });
    return NextResponse.json({ done });
  }
  if (body.action === "train") {
    const status = await requestTraining({ force: true });
    clearModelCache();
    return NextResponse.json({ status });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
