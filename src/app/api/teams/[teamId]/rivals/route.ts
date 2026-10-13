import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { getTeamContext, withTeamLock } from "@/lib/team/load";
import { MAX_RIVALS, MAX_RIVAL_PLAYERS, TEAM_NAME_MAX, isSteamId64 } from "@/lib/team/roster";

interface Props {
  params: Promise<{ teamId: string }>;
}

const schema = z.union([
  z.object({
    name: z.string().trim().min(1).max(TEAM_NAME_MAX),
    steamIds: z.array(z.string().trim().refine(isSteamId64)).min(1).max(MAX_RIVAL_PLAYERS),
  }),
  z.object({
    name: z.string().trim().max(TEAM_NAME_MAX).optional(),
    /** A match in a member's library: the rival = the players who finished on `side`. */
    fromMatchId: z.string().min(1),
    side: z.enum(["CT", "T"]),
  }),
]);

/** POST /api/teams/[teamId]/rivals — scout a new rival (S17 anti-strat). */
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
  const count = await prisma.teamRival.count({ where: { teamId } });
  if (count >= MAX_RIVALS) return NextResponse.json({ error: "Rival limit", max: MAX_RIVALS }, { status: 409 });

  let name: string;
  let steamIds: string[];
  if ("fromMatchId" in body.data) {
    const match = await prisma.match.findFirst({
      where: { id: body.data.fromMatchId, upload: { userId: { in: ctx.memberUserIds }, deletedAt: null } },
      select: { players: { select: { steamId: true, name: true, team: true } } },
    });
    if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
    const side = body.data.side;
    const players = match.players.filter((p) => p.team === side);
    if (players.length === 0) return NextResponse.json({ error: "No players" }, { status: 400 });
    steamIds = players.map((p) => p.steamId).slice(0, MAX_RIVAL_PLAYERS);
    name = body.data.name || `${players[0].name} +${players.length - 1}`.slice(0, TEAM_NAME_MAX);
  } else {
    name = body.data.name;
    steamIds = [...new Set(body.data.steamIds)];
  }

  // Re-count under the team lock: parallel creates could all pass the early check.
  const userId = session.user.id;
  const rival = await withTeamLock(prisma, teamId, async (tx) => {
    if ((await tx.teamRival.count({ where: { teamId } })) >= MAX_RIVALS) return null;
    return tx.teamRival.create({
      data: { teamId, name, steamIds, createdById: userId },
      select: { id: true },
    });
  });
  if (!rival) return NextResponse.json({ error: "Rival limit", max: MAX_RIVALS }, { status: 409 });
  return NextResponse.json({ id: rival.id });
}
