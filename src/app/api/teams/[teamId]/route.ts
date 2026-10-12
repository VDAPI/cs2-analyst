import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getTeamContext } from "@/lib/team/load";
import { newInviteCode } from "@/lib/team/invite";
import {
  MAX_EXTRA_PLAYERS,
  TEAM_NAME_MAX,
  TEAM_TAG_MAX,
  canManageContent,
  canManageTeam,
  isSteamId64,
} from "@/lib/team/roster";

interface Props {
  params: Promise<{ teamId: string }>;
}

const schema = z.object({
  name: z.string().trim().min(2).max(TEAM_NAME_MAX).optional(),
  tag: z.string().trim().max(TEAM_TAG_MAX).nullable().optional(),
  extraSteamIds: z.array(z.string().trim().refine(isSteamId64)).max(MAX_EXTRA_PLAYERS).optional(),
  regenerateInvite: z.literal(true).optional(),
});

/**
 * PATCH /api/teams/[teamId] — the owner renames the team or makes a new
 * invite link (the old one stops working); owner and coach edit the roster
 * players without an account.
 */
export async function PATCH(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId } = await params;
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, tag, extraSteamIds, regenerateInvite } = body.data;
  if ((name !== undefined || tag !== undefined || regenerateInvite) && !canManageTeam(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (extraSteamIds !== undefined && !canManageContent(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(tag !== undefined ? { tag: tag || null } : {}),
      ...(extraSteamIds !== undefined ? { extraSteamIds: [...new Set(extraSteamIds)] } : {}),
      ...(regenerateInvite ? { inviteCode: newInviteCode() } : {}),
    },
    select: { name: true, tag: true, extraSteamIds: true, inviteCode: true },
  });
  return NextResponse.json({ team });
}

/** DELETE /api/teams/[teamId] — the owner deletes the team with its rivals and boards. */
export async function DELETE(_req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId } = await params;
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageTeam(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.team.delete({ where: { id: teamId } });
  return NextResponse.json({ ok: true });
}
