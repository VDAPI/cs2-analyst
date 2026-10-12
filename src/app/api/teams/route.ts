import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { guessMemberSteamId } from "@/lib/team/load";
import { newInviteCode } from "@/lib/team/invite";
import { MAX_TEAMS_PER_USER, TEAM_NAME_MAX, TEAM_TAG_MAX } from "@/lib/team/roster";

const schema = z.object({
  name: z.string().trim().min(2).max(TEAM_NAME_MAX),
  tag: z.string().trim().max(TEAM_TAG_MAX).optional(),
});

/** POST /api/teams — create a team; the creator becomes its owner (S17). */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("write", userId);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const count = await prisma.teamMember.count({ where: { userId } });
  if (count >= MAX_TEAMS_PER_USER) return NextResponse.json({ error: "Team limit", max: MAX_TEAMS_PER_USER }, { status: 409 });

  const team = await prisma.team.create({
    data: {
      name: body.data.name,
      tag: body.data.tag || null,
      inviteCode: newInviteCode(),
      members: { create: { userId, role: "OWNER", steamId: await guessMemberSteamId(prisma, userId) } },
    },
    select: { id: true },
  });
  return NextResponse.json({ id: team.id });
}
