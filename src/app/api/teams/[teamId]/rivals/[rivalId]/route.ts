import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getTeamContext } from "@/lib/team/load";
import { MAX_RIVAL_PLAYERS, TEAM_NAME_MAX, canEditItem, canManageRivals, isSteamId64 } from "@/lib/team/roster";

interface Props {
  params: Promise<{ teamId: string; rivalId: string }>;
}

const schema = z.object({
  name: z.string().trim().min(1).max(TEAM_NAME_MAX).optional(),
  steamIds: z.array(z.string().trim().refine(isSteamId64)).min(1).max(MAX_RIVAL_PLAYERS).optional(),
  notes: z.string().max(4000).optional(),
});

async function load(teamId: string, rivalId: string, userId: string) {
  const ctx = await getTeamContext(prisma, userId, teamId);
  if (!ctx) return null;
  const rival = await prisma.teamRival.findFirst({ where: { id: rivalId, teamId }, select: { id: true, createdById: true } });
  return rival ? { ctx, rival } : null;
}

/**
 * PATCH /api/teams/[teamId]/rivals/[rivalId] — notes are the whole team's
 * anti-strat sheet (any member); name and players: their author, owner or coach.
 */
export async function PATCH(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId, rivalId } = await params;
  const found = await load(teamId, rivalId, session.user.id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, steamIds, notes } = body.data;
  if (
    (name !== undefined && !canEditItem(found.ctx.role, session.user.id, found.rival.createdById)) ||
    (steamIds !== undefined && !canManageRivals(found.ctx.role))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.teamRival.update({
    where: { id: rivalId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(steamIds !== undefined ? { steamIds: [...new Set(steamIds)], reportKey: null } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/teams/[teamId]/rivals/[rivalId] — its boards stay, unlinked. */
export async function DELETE(_req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId, rivalId } = await params;
  const found = await load(teamId, rivalId, session.user.id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditItem(found.ctx.role, session.user.id, found.rival.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.teamRival.delete({ where: { id: rivalId } });
  return NextResponse.json({ ok: true });
}
