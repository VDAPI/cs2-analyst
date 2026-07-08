import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

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
 * Parses tick-level position data on demand for a given round.
 * Returns an array of player snapshots per tick.
 */
export async function GET(req: Request, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId } = await params;
  const url = new URL(req.url);
  const roundNum = parseInt(url.searchParams.get("round") ?? "1", 10);
  const interval = parseInt(url.searchParams.get("interval") ?? "32", 10);

  // Get match + upload file path + round boundaries
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      upload: { select: { fileUrl: true, userId: true } },
      rounds: {
        where: { number: roundNum },
        select: { startTick: true, endTick: true },
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

  // demoparser2 (Rust) needs forward-slash paths to avoid "IllegalPathOp" on Windows.
  const filePath = match.upload.fileUrl.replace(/\\/g, "/");
  const parser = await getParser();

  // Generate tick list for this round at the given interval
  const ticks: number[] = [];
  for (let t = round.startTick; t <= round.endTick; t += interval) {
    ticks.push(t);
  }
  // Always include the end tick
  if (ticks[ticks.length - 1] !== round.endTick) {
    ticks.push(round.endTick);
  }

  const wantedProps = [
    "X", "Y", "Z", "yaw", "health",
    "is_alive", "team_num", "active_weapon_name",
  ];

  const rawTicks = parser.parseTicks(filePath, wantedProps, ticks);

  // Group by tick for efficient client consumption
  // Output: { ticks: Array<{ tick, players: Array<PlayerSnapshot> }> }
  const tickMap = new Map<number, Array<{
    steamId: string;
    name: string;
    team: "CT" | "T";
    x: number;
    y: number;
    z: number;
    yaw: number;
    health: number;
    isAlive: boolean;
    weapon: string;
  }>>();

  for (const row of rawTicks) {
    const tick = Number(row.tick);
    if (!tickMap.has(tick)) tickMap.set(tick, []);

    const teamNum = Number(row.team_num);
    // Skip spectators (team 0 or 1)
    if (teamNum < 2) continue;

    tickMap.get(tick)!.push({
      steamId: String(row.steamid),
      name: String(row.name),
      team: teamNum === 2 ? "T" : "CT",
      x: Number(row.X),
      y: Number(row.Y),
      z: Number(row.Z),
      yaw: Number(row.yaw),
      health: Number(row.health),
      isAlive: Boolean(row.is_alive),
      weapon: String(row.active_weapon_name ?? ""),
    });
  }

  const tickData = Array.from(tickMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([tick, players]) => ({ tick, players }));

  return NextResponse.json({
    matchId,
    round: roundNum,
    startTick: round.startTick,
    endTick: round.endTick,
    interval,
    ticks: tickData,
  });
}
