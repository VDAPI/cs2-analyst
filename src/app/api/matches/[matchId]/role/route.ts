import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { asRoleDefaults, isSideRole, updateRoleDefaults, type RoleSide } from "@/lib/roles/effective";
import { invalidateFindings } from "@/lib/roles/corrections";

/**
 * POST /api/matches/[matchId]/role — correct a player's role on one side of
 * the uploader's own match (S31). Body: { steamId, side: "T" | "CT", role,
 * remember? }. `role: null` goes back to the detected role. `remember` also
 * stores (or clears) it as the usual role for that SteamID in the user's
 * other matches. The affected findings are rebuilt on the next view.
 */
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("write", userId);
  if (limited) return limited;

  const { matchId } = await params;
  const body = (await req.json().catch(() => ({}))) as { steamId?: unknown; side?: unknown; role?: unknown; remember?: unknown };
  const { steamId, side, role } = body;
  if (typeof steamId !== "string" || !/^\d{1,20}$/.test(steamId)) {
    return NextResponse.json({ error: "Invalid steamId" }, { status: 400 });
  }
  if (side !== "T" && side !== "CT") return NextResponse.json({ error: "Invalid side" }, { status: 400 });
  if (role !== null && !isSideRole(side, role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  const remember = body.remember === true;

  const match = await prisma.match.findFirst({
    where: { id: matchId, upload: { userId, deletedAt: null }, players: { some: { steamId } } },
    select: { id: true },
  });
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const key = { matchId_steamId_side: { matchId, steamId, side } };
  if (role) {
    await prisma.roleOverride.upsert({
      where: key,
      create: { matchId, steamId, side, role, userId },
      update: { role, userId },
    });
  } else {
    await prisma.roleOverride.deleteMany({ where: { matchId, steamId, side } });
  }

  if (remember) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { roleDefaults: true } });
    const next = updateRoleDefaults(asRoleDefaults(user?.roleDefaults), steamId, side as RoleSide, role);
    await prisma.user.update({
      where: { id: userId },
      data: { roleDefaults: next ? (next as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
    });
    await invalidateFindings(prisma, { userId, steamId });
  } else {
    await invalidateFindings(prisma, { matchId });
  }
  return NextResponse.json({ steamId, side, role, remember });
}
