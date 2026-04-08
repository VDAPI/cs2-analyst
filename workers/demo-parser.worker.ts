/**
 * Demo Parser Background Worker
 *
 * Runs as a separate process via `npm run worker:parse`.
 * Listens to the "demo-parse" BullMQ queue and processes
 * uploaded .dem files, storing results in PostgreSQL.
 *
 * Flow:
 * 1. User uploads .dem → file stored in R2 → job added to queue
 * 2. This worker picks up the job
 * 3. Downloads .dem from R2 to temp directory
 * 4. Parses with demoparser2
 * 5. Transforms & stores results in PostgreSQL via Prisma
 * 6. Updates DemoUpload status to COMPLETED
 */

import { Worker, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { parseDemoFile } from "../src/lib/parsers/demo-parser";
import { createWriteStream } from "fs";
import { unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

interface DemoParseJobData {
  uploadId: string;
  fileUrl: string;
  userId: string;
}

async function processDemo(job: Job<DemoParseJobData>) {
  const { uploadId, fileUrl, userId } = job.data;
  const tempPath = join(tmpdir(), `demo-${uploadId}.dem`);

  try {
    // Update status to PARSING
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "PARSING" },
    });

    job.updateProgress(10);

    // 1. Download demo from R2/S3
    // TODO: Implement R2 download
    // const response = await fetch(fileUrl);
    // const writer = createWriteStream(tempPath);
    // ...pipe response to writer...

    job.updateProgress(30);

    // 2. Parse the demo
    const parsed = await parseDemoFile(tempPath);

    job.updateProgress(60);

    // 3. Store in database
    const match = await prisma.match.create({
      data: {
        map: parsed.header.map,
        date: parsed.header.date,
        duration: parsed.header.duration,
        server: parsed.header.server,
        scoreCT: parsed.header.scoreCT,
        scoreT: parsed.header.scoreT,
        tickRate: parsed.header.tickRate,
        totalTicks: parsed.header.totalTicks,
        // Create rounds
        rounds: {
          create: parsed.rounds.map((r) => ({
            number: r.number,
            winner: r.winner,
            winReason: mapWinReason(r.winReason),
            startTick: r.startTick,
            endTick: r.endTick,
            ctScore: r.ctScore,
            tScore: r.tScore,
            ctEquipVal: r.ctEquipValue,
            tEquipVal: r.tEquipValue,
          })),
        },
        // Create player entries
        players: {
          create: parsed.players.map((p) => ({
            steamId: p.steamId,
            name: p.name,
            team: p.team,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            adr: p.adr,
            hltvRating: p.hltvRating,
            hsPercent: p.hsPercent,
            utilityDamage: p.utilityDamage,
            flashAssists: p.flashAssists,
            firstKills: p.firstKills,
            firstDeaths: p.firstDeaths,
            // Link to user if exists
            ...(await linkUser(p.steamId)),
          })),
        },
      },
    });

    job.updateProgress(80);

    // 4. Store kills, grenades, bomb events per round
    // TODO: Batch insert kills, grenades, bomb events

    // 5. Update upload status
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "COMPLETED", matchId: match.id },
    });

    job.updateProgress(100);

    return { matchId: match.id };
  } catch (error) {
    // Mark as failed
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  } finally {
    // Clean up temp file
    try {
      await unlink(tempPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function linkUser(steamId: string) {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { id: true },
  });
  return user ? { userId: user.id } : {};
}

function mapWinReason(reason: string) {
  const map: Record<string, string> = {
    t_win_elimination: "ELIMINATION",
    ct_win_elimination: "ELIMINATION",
    t_win_bomb: "BOMB_EXPLODED",
    ct_win_defuse: "BOMB_DEFUSED",
    ct_win_time: "TIME_RAN_OUT",
    target_saved: "TARGET_SAVED",
  };
  return (map[reason.toLowerCase()] ?? "ELIMINATION") as any;
}

// ─── Start Worker ────────────────────────────────────────

const worker = new Worker("demo-parse", processDemo, {
  connection: { url: REDIS_URL },
  concurrency: 2, // parse 2 demos at a time
  limiter: {
    max: 10,
    duration: 60_000, // max 10 jobs per minute
  },
});

worker.on("completed", (job) => {
  console.log(`✅ Demo parsed: ${job.id} → match ${job.returnvalue?.matchId}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Demo parse failed: ${job?.id}`, err.message);
});

worker.on("ready", () => {
  console.log("🎮 Demo parser worker ready, waiting for jobs...");
});
