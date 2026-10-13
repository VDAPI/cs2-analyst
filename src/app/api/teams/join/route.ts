import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { guessMemberSteamId, withTeamLock } from "@/lib/team/load";
import { MAX_MEMBERS, MAX_TEAMS_PER_USER, isInviteCode } from "@/lib/team/roster";

const schema = z.object({ code: z.string().refine(isInviteCode) });

/** POST /api/teams/join — join a team with its invite code (as a player). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("teamJoin", userId);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const team = await prisma.team.findUnique({
    where: { inviteCode: body.data.code },
    select: { id: true, members: { select: { userId: true } } },
  });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (team.members.some((m) => m.userId === userId)) return NextResponse.json({ id: team.id });
  if (team.members.length >= MAX_MEMBERS) return NextResponse.json({ error: "Team full", max: MAX_MEMBERS }, { status: 409 });
  const count = await prisma.teamMember.count({ where: { userId } });
  if (count >= MAX_TEAMS_PER_USER) return NextResponse.json({ error: "Team limit", max: MAX_TEAMS_PER_USER }, { status: 409 });

  const steamId = await guessMemberSteamId(prisma, userId);
  // Re-count under the team lock: parallel joins could all see the last free seat.
  const full = await withTeamLock(prisma, team.id, async (tx) => {
    const members = await tx.teamMember.findMany({ where: { teamId: team.id }, select: { userId: true } });
    if (members.some((m) => m.userId === userId)) return false;
    if (members.length >= MAX_MEMBERS) return true;
    await tx.teamMember.create({ data: { teamId: team.id, userId, role: "PLAYER", steamId } });
    return false;
  });
  if (full) return NextResponse.json({ error: "Team full", max: MAX_MEMBERS }, { status: 409 });
  return NextResponse.json({ id: team.id });
}
