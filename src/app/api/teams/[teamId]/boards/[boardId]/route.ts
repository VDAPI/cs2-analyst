import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getTeamContext } from "@/lib/team/load";
import { BOARD_NAME_MAX, parseBoardData } from "@/lib/team/board";
import { canEditItem } from "@/lib/team/roster";

interface Props {
  params: Promise<{ teamId: string; boardId: string }>;
}

const schema = z.object({
  name: z.string().trim().min(1).max(BOARD_NAME_MAX).optional(),
  map: z.string().regex(/^[a-z0-9_]{2,32}$/).optional(),
  side: z.enum(["CT", "T"]).nullable().optional(),
  data: z.unknown().optional(),
  /** updatedAt the editor loaded; a newer save by someone else is a conflict. */
  baseUpdatedAt: z.string().datetime().optional(),
});

async function load(teamId: string, boardId: string, userId: string) {
  const ctx = await getTeamContext(prisma, userId, teamId);
  if (!ctx) return null;
  const board = await prisma.tacticBoard.findFirst({ where: { id: boardId, teamId }, select: { id: true, createdById: true, updatedAt: true } });
  return board ? { ctx, board } : null;
}

/** PATCH /api/teams/[teamId]/boards/[boardId] — save a board (its author, owner or coach). */
export async function PATCH(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId, boardId } = await params;
  const found = await load(teamId, boardId, session.user.id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditItem(found.ctx.role, session.user.id, found.board.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, map, side, baseUpdatedAt } = body.data;
  let data;
  if (body.data.data !== undefined) {
    data = parseBoardData(body.data.data);
    if (!data) return NextResponse.json({ error: "Invalid board" }, { status: 400 });
  }
  if (baseUpdatedAt && new Date(baseUpdatedAt).getTime() < found.board.updatedAt.getTime()) {
    return NextResponse.json({ error: "Conflict", updatedAt: found.board.updatedAt.toISOString() }, { status: 409 });
  }
  const saved = await prisma.tacticBoard.update({
    where: { id: boardId },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(map !== undefined ? { map } : {}),
      ...(side !== undefined ? { side } : {}),
      ...(data ? { data } : {}),
    },
    select: { updatedAt: true },
  });
  return NextResponse.json({ updatedAt: saved.updatedAt.toISOString() });
}

/** DELETE /api/teams/[teamId]/boards/[boardId] */
export async function DELETE(_req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId, boardId } = await params;
  const found = await load(teamId, boardId, session.user.id);
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditItem(found.ctx.role, session.user.id, found.board.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.tacticBoard.delete({ where: { id: boardId } });
  return NextResponse.json({ ok: true });
}
