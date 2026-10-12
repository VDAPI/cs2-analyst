import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { MAX_GOALS, validTarget } from "@/lib/progress/goals";
import { PROGRESS_METRIC_KEYS } from "@/lib/progress/metrics";
import { rateLimit } from "@/lib/security/rate-limit-http";

const schema = z.object({
  metric: z.enum(PROGRESS_METRIC_KEYS as [string, ...string[]]),
  target: z.number(),
});

/** POST /api/progress/goals — set (or change) the goal for one metric. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const userId = session.user.id;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success || !validTarget(body.data.metric, body.data.target)) {
    return NextResponse.json({ error: "Invalid goal" }, { status: 400 });
  }
  const { metric, target } = body.data;

  const existing = await prisma.goal.findUnique({ where: { userId_metric: { userId, metric } } });
  if (!existing && (await prisma.goal.count({ where: { userId } })) >= MAX_GOALS) {
    return NextResponse.json({ error: "Goal limit reached", limit: MAX_GOALS }, { status: 409 });
  }
  // A new target is a new goal: whether it was met is worked out again.
  const goal = await prisma.goal.upsert({
    where: { userId_metric: { userId, metric } },
    create: { userId, metric, target },
    update: { target, achievedAt: null, createdAt: new Date() },
  });
  return NextResponse.json({ goal });
}
