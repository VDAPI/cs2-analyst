import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getLocale } from "@/lib/i18n/server";
import { planCoachText, planContent } from "@/lib/coach/persist";
import { rateLimit } from "@/lib/security/rate-limit-http";

const textSchema = z.object({ planId: z.string().min(1), force: z.boolean().optional() });
const daySchema = z.object({ planId: z.string().min(1), day: z.number().int().min(0).max(6), done: z.boolean() });

async function ownPlan(userId: string, planId: string) {
  return prisma.trainingPlan.findFirst({ where: { id: planId, userId } });
}

/** POST /api/coach/plan — the AI coach's text for the weekly plan (S15), cached or written now. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("coach", session.user.id);
  if (limited) return limited;
  const body = textSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const row = await ownPlan(session.user.id, body.data.planId);
  const content = row ? planContent(row) : null;
  if (!row || !content) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const locale = await getLocale();
  const result = await planCoachText(prisma, { userId: session.user.id, row, content, locale, force: body.data.force });
  return NextResponse.json(result);
}

/** PATCH /api/coach/plan — tick a day of the plan off (or back on). */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const body = daySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const row = await ownPlan(session.user.id, body.data.planId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { day, done } = body.data;
  const days = new Set(row.doneDays);
  if (done) days.add(day);
  else days.delete(day);
  const updated = await prisma.trainingPlan.update({
    where: { id: row.id },
    data: { doneDays: [...days].sort((a, b) => a - b) },
    select: { doneDays: true },
  });
  return NextResponse.json(updated);
}
