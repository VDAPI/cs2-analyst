import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { extractShareCode } from "@/lib/steam/share-code";
import {
  addSteamMatch,
  AUTH_CODE_RE,
  SteamHistoryError,
  syncSteamHistory,
} from "@/lib/steam/match-history";

const Body = z.object({ authCode: z.string().max(40), shareCode: z.string().max(200) });

/**
 * PUT /api/steam/history — opt in to the Steam match history: store the
 * player's authentication code and newest share code, then sync once (which
 * also checks the code with Steam). Requires a linked Steam account.
 */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  const authCode = parsed.success ? parsed.data.authCode.trim().toUpperCase() : "";
  if (!AUTH_CODE_RE.test(authCode)) {
    return NextResponse.json({ error: "Invalid auth code", code: "invalid_auth_code" }, { status: 400 });
  }
  const shareCode = parsed.success ? extractShareCode(parsed.data.shareCode) : null;
  if (!shareCode) {
    return NextResponse.json({ error: "Invalid share code", code: "invalid_share_code" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true } });
  if (!user?.steamId) {
    return NextResponse.json({ error: "Link Steam first", code: "no_steam" }, { status: 409 });
  }

  await addSteamMatch(prisma, userId, shareCode);
  await prisma.user.update({
    where: { id: userId },
    data: { steamAuthCode: authCode, steamLastShareCode: shareCode },
  });

  try {
    const result = await syncSteamHistory(prisma, userId);
    return NextResponse.json({ added: result.added });
  } catch (err) {
    if (err instanceof SteamHistoryError) {
      if (err.code === "invalid_auth") {
        // Don't keep a code Steam refuses.
        await prisma.user.update({
          where: { id: userId },
          data: { steamAuthCode: null, steamLastShareCode: null },
        });
      }
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }
}

/** DELETE /api/steam/history — opt out: forget the authentication code. Added matches stay. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.user.update({
    where: { id: session.user.id },
    data: { steamAuthCode: null, steamLastShareCode: null, lastSteamSync: null },
  });
  return NextResponse.json({ ok: true });
}
