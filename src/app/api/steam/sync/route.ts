import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { SteamHistoryError, syncSteamHistory } from "@/lib/steam/match-history";

/** POST /api/steam/sync — fetch new share codes from the Steam history (player-initiated). */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await syncSteamHistory(prisma, session.user.id);
    return NextResponse.json({ added: result.added });
  } catch (err) {
    if (err instanceof SteamHistoryError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }
}
