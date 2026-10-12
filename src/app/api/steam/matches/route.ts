import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { extractShareCode, parseReplayUrl, replayUrlMatchId, decodeShareCode } from "@/lib/steam/share-code";
import { addSteamMatch } from "@/lib/steam/match-history";

const Body = z.object({
  shareCode: z.string().max(200),
  replayUrl: z.string().max(500).optional(),
});

/**
 * POST /api/steam/matches — add a Premier / matchmaking match by share code,
 * optionally with a Valve replay link. Nothing is downloaded here.
 * Errors carry a `code` the UI translates.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", code: "invalid_share_code" }, { status: 400 });
  }

  const shareCode = extractShareCode(parsed.data.shareCode);
  if (!shareCode) {
    return NextResponse.json({ error: "Invalid share code", code: "invalid_share_code" }, { status: 400 });
  }

  let demoUrl: string | null = null;
  if (parsed.data.replayUrl?.trim()) {
    demoUrl = parseReplayUrl(parsed.data.replayUrl);
    if (!demoUrl) {
      return NextResponse.json({ error: "Invalid replay link", code: "invalid_replay_url" }, { status: 400 });
    }
    if (replayUrlMatchId(demoUrl) !== decodeShareCode(shareCode).matchId) {
      return NextResponse.json(
        { error: "Replay link is for another match", code: "replay_mismatch" },
        { status: 400 }
      );
    }
  }

  const sm = await addSteamMatch(prisma, session.user.id, shareCode, demoUrl);
  return NextResponse.json({ id: sm.id }, { status: 201 });
}
