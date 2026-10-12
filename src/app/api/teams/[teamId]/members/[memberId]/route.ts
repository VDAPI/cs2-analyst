import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getTeamContext } from "@/lib/team/load";
import { removeMember } from "@/lib/team/membership";
import { canManageTeam, isSteamId64 } from "@/lib/team/roster";

interface Props {
  params: Promise<{ teamId: string; memberId: string }>;
}

const schema = z.object({
  role: z.enum(["OWNER", "COACH", "PLAYER"]).optional(),
  /** In-game SteamID64; null = use the account's linked Steam. */
  steamId: z.string().trim().refine(isSteamId64).nullable().optional(),
});

/**
 * PATCH /api/teams/[teamId]/members/[memberId] — the owner changes a role
 * (making someone owner hands the team over: the old owner becomes coach);
 * a member sets their own in-game SteamID, the owner anyone's.
 */
export async function PATCH(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId, memberId } = await params;
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  const target = ctx?.members.find((m) => m.id === memberId);
  if (!ctx || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { role, steamId } = body.data;
  const self = target.id === ctx.memberId;
  if (steamId !== undefined && !self && !canManageTeam(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (role !== undefined) {
    if (!canManageTeam(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // The owner stays owner until they hand the team to someone else.
    if (self && role !== "OWNER") return NextResponse.json({ error: "Transfer ownership first" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    if (role === "OWNER" && !self) {
      await tx.teamMember.update({ where: { id: ctx.memberId }, data: { role: "COACH" } });
    }
    await tx.teamMember.update({
      where: { id: target.id },
      data: { ...(role !== undefined ? { role } : {}), ...(steamId !== undefined ? { steamId } : {}) },
    });
  });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/teams/[teamId]/members/[memberId] — leave the team, or the owner removes a member. */
export async function DELETE(_req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId, memberId } = await params;
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  const target = ctx?.members.find((m) => m.id === memberId);
  if (!ctx || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.id !== ctx.memberId && !canManageTeam(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await prisma.$transaction((tx) => removeMember(tx, teamId, target.userId));
  return NextResponse.json({ ok: true, result });
}
