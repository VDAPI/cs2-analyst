import { NextResponse } from "next/server";
import { access as fileAccess } from "fs/promises";
import { getMatchAccess, roundAllowed } from "@/lib/sharing/access";
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
import { loadDemoParser } from "@/lib/parsers/load-parser";

// demoparser2 (native bindings), or the E2E fixture parser.
const getParser = loadDemoParser;

interface Props {
  params: Promise<{ matchId: string }>;
}

/**
 * GET /api/matches/[matchId]/ticks?round=1&interval=32[&from=T1&to=T2]
 *
 * `from`/`to` (ticks, inclusive) cut the round down to a window — the 2D clip
 * on a finding card asks for a few seconds around the mistake at full rate.
 *
 * Player snapshots per tick for one round. Served from the sampled RoundTicks
 * stored at parse time, so it keeps working after the .dem is deleted. Matches
 * parsed before RoundTicks existed fall back to parsing the .dem live while the
 * file is still on disk (run `npm run backfill:replay` to store them).
 */
export async function GET(req: Request, { params }: Props) {
  const { matchId } = await params;
  // The uploader, or a share link of this match (S16).
  const access = await getMatchAccess(req, matchId);
  if (!access) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const roundNum = parseInt(url.searchParams.get("round") ?? "1", 10);
  const requested = parseInt(url.searchParams.get("interval") ?? "32", 10);
  const interval = Number.isFinite(requested) && requested >= 1 ? requested : 32;
  const fromTick = parseInt(url.searchParams.get("from") ?? "", 10);
  const toTick = parseInt(url.searchParams.get("to") ?? "", 10);

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

  if (!roundAllowed(access, roundNum)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    const onDisk = filePath !== "" && (await fileAccess(filePath).then(() => true, () => false));
    if (!onDisk) {
      return NextResponse.json(
        { error: "Replay data not available: the demo was removed before replay data was stored" },
        { status: 404 }
      );
    }
    // Never finer than the stored replay data (every 4 ticks): a full-rate
    // native parse per request is too easy to trigger through a share link.
    const demoInterval = Math.max(4, interval);
    const parser = await getParser();
    const rows = parser.parseTicks(
      filePath,
      REPLAY_TICK_PROPS,
      sampleTickList(round.startTick, round.endTick, demoInterval)
    ) as Record<string, unknown>[];
    frames = decodeRoundTicks(encodeRoundTicks(rows ?? [], round.startTick, round.endTick, demoInterval));
    storedInterval = demoInterval;
    source = "demo";
  }

  const step = Math.max(1, Math.round(interval / storedInterval));
  const windowed = frames.filter(
    (f) => (!Number.isFinite(fromTick) || f.tick >= fromTick) && (!Number.isFinite(toTick) || f.tick <= toTick)
  );
  const ticks = subsampleFrames(windowed, step).map((f) => ({
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
