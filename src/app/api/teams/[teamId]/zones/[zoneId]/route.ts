import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getTeamContext } from "@/lib/team/load";
import { canManageContent } from "@/lib/team/roster";
import { zoneFields } from "@/lib/team/zone-schema";

interface Props {
  params: Promise<{ teamId: string; zoneId: string }>;
}

const patchSchema = z.object(zoneFields).partial().strict();

async function editor(teamId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageContent(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

/** PATCH /api/teams/[teamId]/zones/[zoneId] — rename a team's zone or change its CT position / lanes. */
export async function PATCH(req: Request, { params }: Props) {
  const { teamId, zoneId } = await params;
  const denied = await editor(teamId);
  if (denied) return denied;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const done = await prisma.teamMapZone.updateMany({ where: { id: zoneId, teamId }, data: parsed.data });
  if (done.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/teams/[teamId]/zones/[zoneId] — remove a team's change; a shared zone it replaced or hid comes back. */
export async function DELETE(_req: Request, { params }: Props) {
  const { teamId, zoneId } = await params;
  const denied = await editor(teamId);
  if (denied) return denied;
  await prisma.teamMapZone.deleteMany({ where: { id: zoneId, teamId } });
  return NextResponse.json({ ok: true });
}
