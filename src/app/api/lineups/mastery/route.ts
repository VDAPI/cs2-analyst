import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { LINEUP_KEY_RE } from "@/lib/training/lineup-trainer";
import { MAP_CONFIGS } from "@/lib/utils/maps";
import { rateLimit } from "@/lib/security/rate-limit-http";

const schema = z.object({
  map: z.string().refine((m) => m in MAP_CONFIGS),
  key: z.string().max(80).regex(LINEUP_KEY_RE),
  mastered: z.boolean(),
});

/** POST /api/lineups/mastery — mark a lineup as mastered (or not) for the signed-in player (S22). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const userId = session.user.id;
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { map, key, mastered } = body.data;
  if (mastered) {
    await prisma.lineupMastery.upsert({
      where: { userId_map_key: { userId, map, key } },
      create: { userId, map, key },
      update: {},
    });
  } else {
    await prisma.lineupMastery.deleteMany({ where: { userId, map, key } });
  }
  return NextResponse.json({ map, key, mastered });
}
