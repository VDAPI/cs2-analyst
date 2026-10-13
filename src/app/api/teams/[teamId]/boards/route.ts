import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getRivalReport, getTeamContext, withTeamLock } from "@/lib/team/load";
import { BOARD_NAME_MAX, boardFromTokens, emptyBoard, parseBoardData, type BoardData } from "@/lib/team/board";
import { MAX_BOARDS } from "@/lib/team/roster";
import { getMapConfig } from "@/lib/utils/maps";

interface Props {
  params: Promise<{ teamId: string }>;
}

const schema = z.object({
  name: z.string().trim().min(1).max(BOARD_NAME_MAX),
  map: z.string().regex(/^[a-z0-9_]{2,32}$/),
  side: z.enum(["CT", "T"]).nullable().optional(),
  data: z.unknown().optional(),
  /** Start from a rival's typical positions on this map (`side` = the rival's side). */
  fromRival: z.object({ rivalId: z.string().min(1), side: z.enum(["CT", "T"]) }).optional(),
});

/** POST /api/teams/[teamId]/boards — a new tactic board (empty, given, or from a rival's setup). */
export async function POST(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;
  const { teamId } = await params;
  const ctx = await getTeamContext(prisma, session.user.id, teamId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, map, fromRival } = body.data;
  const count = await prisma.tacticBoard.count({ where: { teamId } });
  if (count >= MAX_BOARDS) return NextResponse.json({ error: "Board limit", max: MAX_BOARDS }, { status: 409 });

  let data: BoardData = emptyBoard();
  let side = body.data.side ?? null;
  let rivalId: string | null = null;
  if (body.data.data !== undefined) {
    const parsed = parseBoardData(body.data.data);
    if (!parsed) return NextResponse.json({ error: "Invalid board" }, { status: 400 });
    data = parsed;
  } else if (fromRival) {
    const rival = await prisma.teamRival.findFirst({
      where: { id: fromRival.rivalId, teamId },
      select: { id: true, steamIds: true, reportKey: true, report: true },
    });
    if (!rival) return NextResponse.json({ error: "Rival not found" }, { status: 404 });
    const { report } = await getRivalReport(prisma, ctx.memberUserIds, rival);
    const mapReport = report.maps.find((m) => m.map === map);
    const tokens = mapReport ? (fromRival.side === "CT" ? mapReport.ct.board : mapReport.t.board) : [];
    const config = getMapConfig(map) ?? null;
    data = boardFromTokens(config, fromRival.side, tokens);
    // The board is our plan against them: we play the other side.
    side = fromRival.side === "CT" ? "T" : "CT";
    rivalId = rival.id;
  }

  // Re-count under the team lock: parallel creates could all pass the early check.
  const userId = session.user.id;
  const board = await withTeamLock(prisma, teamId, async (tx) => {
    if ((await tx.tacticBoard.count({ where: { teamId } })) >= MAX_BOARDS) return null;
    return tx.tacticBoard.create({
      data: { teamId, name, map, side, data, rivalId, createdById: userId },
      select: { id: true },
    });
  });
  if (!board) return NextResponse.json({ error: "Board limit", max: MAX_BOARDS }, { status: 409 });
  return NextResponse.json({ id: board.id });
}
