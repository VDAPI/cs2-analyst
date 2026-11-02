import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getTeamContext } from "@/lib/team/load";
import { canManageContent, MAX_TEAM_ZONES } from "@/lib/team/roster";
import { zoneFields } from "@/lib/team/zone-schema";

interface Props {
  params: Promise<{ teamId: string }>;
}

const createSchema = z
  .object({
    map: z.string().regex(/^[a-z0-9_]{1,40}$/),
    ...zoneFields,
    replacesZoneId: z.string().min(1).max(40).nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/teams/[teamId]/zones — a team's change on /callouts: a new zone, its
 * version of a shared zone (`replacesZoneId`), or that zone hidden (`hidden`).
 */
export async function POST(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId } = await params;
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageContent(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { map, replacesZoneId, hidden } = parsed.data;
  if (hidden && !replacesZoneId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const count = await prisma.teamMapZone.count({ where: { teamId, map } });
  if (count >= MAX_TEAM_ZONES) return NextResponse.json({ error: "Zone limit", max: MAX_TEAM_ZONES }, { status: 409 });
  if (replacesZoneId) {
    // One row per shared zone, and only zones of this map.
    const shared = await prisma.mapZone.findFirst({ where: { id: replacesZoneId, map }, select: { id: true } });
    if (!shared) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.teamMapZone.deleteMany({ where: { teamId, replacesZoneId } });
  }
  const zone = await prisma.teamMapZone.create({ data: { ...parsed.data, teamId }, select: { id: true } });
  return NextResponse.json({ id: zone.id }, { status: 201 });
}
