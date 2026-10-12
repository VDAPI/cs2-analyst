import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { access } from "fs/promises";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { parseDemoLocation } from "@/lib/storage/demo-store";
import {
  REPLAY_TICK_PROPS,
  decodeRoundTicks,
  encodeRoundTicks,
  sampleTickList,
  subsampleFrames,
  type ReplayFrame,
} from "@/lib/replay/round-ticks";

// Dynamic import — demoparser2 uses native Node bindings
let demoparser: typeof import("@laihoe/demoparser2") | null = null;
async function getParser() {
  if (!demoparser) {
    demoparser = await import("@laihoe/demoparser2");
  }
  return demoparser;
}

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/ticks?round=1&interval=32
 *
 * Player snapshots per tick for one round. Served from the sampled RoundTicks
 * stored at parse time, so it keeps working after the .dem is deleted. Matches
 * parsed before RoundTicks existed fall back to parsing the .dem live while the
 * file is still on disk (run `npm run backfill:replay` to store them).
 */
export async function GET(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const url = new URL(req.url);
  const roundNum = parseInt(url.searchParams.get("round") ?? "1", 10);
  const requested = parseInt(url.searchParams.get("interval") ?? "32", 10);
  const interval = Number.isFinite(requested) && requested >= 1 ? requested : 32;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      upload: { select: { fileUrl: true, userId: true } },
      rounds: {
        where: { number: roundNum },
        select: { startTick: true, endTick: true, ticks: true },
      },
    },
  });

  if (!match || !match.upload) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Auth check: only the uploader can access tick data
  if (match.upload.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const round = match.rounds[0];
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  let frames: ReplayFrame[];
  let storedInterval: number;
  let source: "db" | "demo";

  if (round.ticks) {
    frames = decodeRoundTicks(round.ticks);
    storedInterval = round.ticks.interval;
    source = "db";
  } else {
    // Only a demo on local disk is worth parsing per request; everything
    // analyzed since replay data existed has it in the DB anyway.
    const loc = parseDemoLocation(match.upload.fileUrl);
    const filePath = loc.kind === "local" ? loc.path : "";
    const onDisk = filePath !== "" && (await access(filePath).then(() => true, () => false));
    if (!onDisk) {
      return NextResponse.json(
        { error: "Replay data not available: the demo was removed before replay data was stored" },
        { status: 404 }
      );
    }
    const parser = await getParser();
    const rows = parser.parseTicks(
      filePath,
      REPLAY_TICK_PROPS,
      sampleTickList(round.startTick, round.endTick, interval)
    ) as Record<string, unknown>[];
    frames = decodeRoundTicks(encodeRoundTicks(rows ?? [], round.startTick, round.endTick, interval));
    storedInterval = interval;
    source = "demo";
  }

  const step = Math.max(1, Math.round(interval / storedInterval));
  const ticks = subsampleFrames(frames, step).map((f) => ({
    tick: f.tick,
    players: f.players.map((p) => ({
      steamId: p.steamId,
      name: p.name,
      team: p.team,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      health: p.health,
      isAlive: p.isAlive,
      weapon: p.weapon,
    })),
  }));

  return NextResponse.json({
    matchId,
    round: roundNum,
    startTick: round.startTick,
    endTick: round.endTick,
    interval: step * storedInterval,
    source,
    ticks,
  });
}
