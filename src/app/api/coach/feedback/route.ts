import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isFindingType } from "@/lib/findings/catalog";
import { rateLimit } from "@/lib/security/rate-limit-http";

const schema = z.object({
  type: z.string().refine(isFindingType),
  /** "match:<matchId>" or "plan:<YYYY-MM-DD>". */
  context: z.string().regex(/^(match:[\w-]{1,64}|plan:\d{4}-\d{2}-\d{2})$/),
  /** null clears the rating. */
  helpful: z.boolean().nullable(),
});

/** POST /api/coach/feedback — rate one piece of the coach's advice (S15). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const userId = session.user.id;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { type, context, helpful } = body.data;

  // A match rating is only accepted for the user's own analysis.
  if (context.startsWith("match:")) {
    const owned = await prisma.match.count({ where: { id: context.slice(6), upload: { userId } } });
    if (owned === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const where = { userId_context_type: { userId, context, type } };
  if (helpful === null) {
    await prisma.coachFeedback.deleteMany({ where: { userId, context, type } });
  } else {
    await prisma.coachFeedback.upsert({ where, create: { userId, context, type, helpful }, update: { helpful } });
  }
  return NextResponse.json({ ok: true, helpful });
}
