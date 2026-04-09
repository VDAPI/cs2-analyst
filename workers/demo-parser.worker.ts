/**
 * Demo Parser Background Worker
 *
 * Runs as a separate process via `npm run worker:parse`.
 * Listens to the "demo-parse" BullMQ queue and processes
 * uploaded .dem files, storing results in PostgreSQL.
 */

import { Worker, type Job } from "bullmq";
import { Prisma, PrismaClient } from "@prisma/client";
import { parseDemoFile } from "../src/lib/parsers/demo-parser";
import { unlink } from "fs/promises";

const prisma = new PrismaClient();

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

interface DemoParseJobData {
  uploadId: string;
  filePath: string;
  userId: string;
}

async function processDemo(job: Job<DemoParseJobData>) {
  const { uploadId, filePath } = job.data;

  try {
    // Update status to PARSING
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "PARSING" },
    });

    await job.updateProgress(10);

    // Parse the demo
    const parsed = await parseDemoFile(filePath);

    await job.updateProgress(50);

    // Resolve user links for all players
    const playerUserLinks = await Promise.all(
      parsed.players.map((p) => linkUser(p.steamId))
    );

    // Create match with rounds and players
    const match = await prisma.match.create({
      data: {
        map: parsed.header.map,
        date: parsed.header.date,
        duration: parsed.header.duration,
        server: parsed.header.server || null,
        scoreCT: parsed.header.scoreCT,
        scoreT: parsed.header.scoreT,
        tickRate: parsed.header.tickRate,
        totalTicks: parsed.header.totalTicks,
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
            ctMoney: r.ctMoney,
            tMoney: r.tMoney,
            buyType_CT: mapBuyType(r.buyTypeCT),
            buyType_T: mapBuyType(r.buyTypeT),
          })),
        },
        players: {
          create: parsed.players.map((p, i) => ({
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
            ...playerUserLinks[i],
          })),
        },
      },
    });

    await job.updateProgress(70);

    // Get round IDs for foreign keys
    const roundRecords = await prisma.round.findMany({
      where: { matchId: match.id },
      select: { id: true, number: true },
    });
    const roundIdByNumber = Object.fromEntries(
      roundRecords.map((r) => [r.number, r.id])
    );

    // Batch insert kills
    if (parsed.kills.length > 0) {
      await prisma.kill.createMany({
        data: parsed.kills
          .filter((k) => roundIdByNumber[k.roundNumber])
          .map((k) => ({
            roundId: roundIdByNumber[k.roundNumber],
            tick: k.tick,
            attackerSteamId: k.attackerSteamId,
            attackerName: k.attackerName,
            victimSteamId: k.victimSteamId,
            victimName: k.victimName,
            assisterSteamId: k.assisterSteamId ?? null,
            weapon: k.weapon,
            headshot: k.headshot,
            wallbang: k.wallbang,
            throughSmoke: k.throughSmoke,
            noScope: k.noScope,
            flashAssisted: k.flashAssisted,
            attackerPosX: k.attackerPos.x,
            attackerPosY: k.attackerPos.y,
            attackerPosZ: k.attackerPos.z,
            victimPosX: k.victimPos.x,
            victimPosY: k.victimPos.y,
            victimPosZ: k.victimPos.z,
            isFirstKill: k.isFirstKill,
          })),
      });
    }

    await job.updateProgress(85);

    // Batch insert bomb events
    if (parsed.bombEvents.length > 0) {
      await prisma.bombEvent.createMany({
        data: parsed.bombEvents
          .filter((b) => roundIdByNumber[b.roundNumber])
          .map((b) => ({
            roundId: roundIdByNumber[b.roundNumber],
            tick: b.tick,
            type: mapBombAction(b.type),
            playerSteamId: b.playerSteamId,
            posX: b.pos.x,
            posY: b.pos.y,
            posZ: b.pos.z,
            site: b.site ?? null,
          })),
      });
    }

    // Batch insert grenade events
    if (parsed.grenades.length > 0) {
      await prisma.grenadeEvent.createMany({
        data: parsed.grenades
          .filter((g) => roundIdByNumber[g.roundNumber])
          .map((g) => ({
            roundId: roundIdByNumber[g.roundNumber],
            tick: g.tick,
            throwerSteamId: g.throwerSteamId,
            throwerName: g.throwerName,
            grenadeType: g.type,
            throwPosX: g.throwPos.x,
            throwPosY: g.throwPos.y,
            throwPosZ: g.throwPos.z,
            landPosX: g.landPos.x,
            landPosY: g.landPos.y,
            landPosZ: g.landPos.z,
            trajectory: Prisma.DbNull,
            duration: g.duration ?? null,
            damageDealt: g.damageDealt,
            playersFlashed: g.playersFlashed,
          })),
      });
    }

    await job.updateProgress(95);

    // Update upload status
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "COMPLETED", matchId: match.id },
    });

    // Clean up FACEIT demos (re-downloadable, save disk space)
    const upload = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { source: true },
    });
    if (upload?.source === "FACEIT") {
      await unlink(filePath).catch(() => {});
    }

    await job.updateProgress(100);

    return { matchId: match.id };
  } catch (error) {
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

async function linkUser(steamId: string) {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { id: true },
  });
  return user ? { userId: user.id } : {};
}

function mapWinReason(reason: string): "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSED" | "TIME_RAN_OUT" | "TARGET_SAVED" {
  const map: Record<string, "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSED" | "TIME_RAN_OUT" | "TARGET_SAVED"> = {
    ELIMINATION: "ELIMINATION",
    BOMB_EXPLODED: "BOMB_EXPLODED",
    BOMB_DEFUSED: "BOMB_DEFUSED",
    TIME_RAN_OUT: "TIME_RAN_OUT",
    TARGET_SAVED: "TARGET_SAVED",
  };
  return map[reason] ?? "ELIMINATION";
}

function mapBuyType(type: string): "FULL_BUY" | "FORCE_BUY" | "ECO" | "HALF_BUY" | "PISTOL" | "UNKNOWN" {
  const map: Record<string, "FULL_BUY" | "FORCE_BUY" | "ECO" | "HALF_BUY" | "PISTOL" | "UNKNOWN"> = {
    FULL_BUY: "FULL_BUY",
    FORCE_BUY: "FORCE_BUY",
    ECO: "ECO",
    HALF_BUY: "HALF_BUY",
    PISTOL: "PISTOL",
    UNKNOWN: "UNKNOWN",
  };
  return map[type] ?? "UNKNOWN";
}

function mapBombAction(type: string): "PLANT_BEGIN" | "PLANTED" | "DEFUSE_BEGIN" | "DEFUSED" | "EXPLODED" | "DROPPED" | "PICKED_UP" {
  const map: Record<string, "PLANT_BEGIN" | "PLANTED" | "DEFUSE_BEGIN" | "DEFUSED" | "EXPLODED" | "DROPPED" | "PICKED_UP"> = {
    PLANTED: "PLANTED",
    DEFUSED: "DEFUSED",
    EXPLODED: "EXPLODED",
    PLANT_BEGIN: "PLANT_BEGIN",
    DEFUSE_BEGIN: "DEFUSE_BEGIN",
    DROPPED: "DROPPED",
    PICKED_UP: "PICKED_UP",
  };
  return map[type] ?? "PLANTED";
}

// ─── Start Worker ────────────────────────────────────────

const worker = new Worker("demo-parse", processDemo, {
  connection: { url: REDIS_URL },
  concurrency: 2,
  limiter: {
    max: 10,
    duration: 60_000,
  },
});

worker.on("completed", (job) => {
  console.log(`Demo parsed: ${job.id} -> match ${job.returnvalue?.matchId}`);
});

worker.on("failed", (job, err) => {
  console.error(`Demo parse failed: ${job?.id}`, err.message);
});

worker.on("ready", () => {
  console.log("Demo parser worker ready, waiting for jobs...");
});
