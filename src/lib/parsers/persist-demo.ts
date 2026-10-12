/**
 * Parse a .dem file and persist the full match (rounds, players, kills,
 * bombs, economy, grenades) to the database, driving the DemoUpload status
 * QUEUED → PARSING → COMPLETED/FAILED.
 *
 * Shared by both the manual-upload parse worker and the FACEIT download
 * worker so the parse/persist logic lives in exactly one place.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { parseDemoFile } from "./demo-parser";
import { formatReplayStats, parseAndPersistReplayData } from "./persist-replay";
import { computeAndPersistMechanics } from "../analysis/persist-mechanics";
import { computeAndPersistAim } from "../analysis/persist-aim";
import { computeAndPersistFindings } from "../findings/persist";
import { computeAndPersistUtility, persistPlaceCells } from "../analysis/persist-utility";
import { aggregatePlaces } from "../analysis/places";
import { parsePlaceSamples } from "./replay-data";
import { computeAndPersistTactics } from "../analysis/persist-tactics";
import { parsePlayerRanks } from "./ranks";
import { persistMatchRanks } from "../norms/ranks";
import { computeAndPersistNormSamples, refreshNorms, refreshNormsIfStale } from "../norms/persist";

interface PersistArgs {
  uploadId: string;
  filePath: string;
}

/**
 * @param reportProgress optional 0-100 progress reporter (e.g. job.updateProgress)
 * @returns the created match id, and whether replay data (sampled ticks,
 *   shots, damage) was stored — only then may the .dem be deleted.
 * On failure, sets the upload to FAILED and rethrows. A failure in the replay
 * step alone does not fail the analysis.
 */
export async function parseAndPersistDemo(
  prisma: PrismaClient,
  { uploadId, filePath }: PersistArgs,
  reportProgress?: (pct: number) => void | Promise<void>
): Promise<{ matchId: string; replayStored: boolean }> {
  // Progress also goes on the upload row, for the analysis queue screen.
  const onProgress = async (pct: number) => {
    await reportProgress?.(pct);
    await prisma.demoUpload
      .update({ where: { id: uploadId }, data: { progress: pct } })
      .catch(() => {});
  };
  const startedAt = Date.now();
  // The Match this run created. Deleted again if the run fails, so a failed
  // or retried parse never leaves an unreachable Match behind.
  let createdMatchId: string | null = null;
  try {
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "PARSING", error: null, parseStartedAt: new Date(startedAt) },
    });
    await onProgress?.(10);

    const parsed = await parseDemoFile(filePath);
    await onProgress?.(50);

    const playerUserLinks = await Promise.all(
      parsed.players.map((p) => linkUser(prisma, p.steamId))
    );

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
            clutchWins: p.clutchWins,
            clutchAttempts: p.clutchAttempts,
            firstKills: p.firstKills,
            firstDeaths: p.firstDeaths,
            ...playerUserLinks[i],
          })),
        },
      },
    });
    createdMatchId = match.id;
    await onProgress?.(70);

    const roundRecords = await prisma.round.findMany({
      where: { matchId: match.id },
      select: { id: true, number: true },
    });
    const roundIdByNumber = Object.fromEntries(
      roundRecords.map((r) => [r.number, r.id])
    );

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
            victimInventory: k.victimInventory ?? Prisma.DbNull,
          })),
      });
    }
    await onProgress?.(85);

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

    if (parsed.roundPlayers.length > 0) {
      await prisma.roundPlayer.createMany({
        data: parsed.roundPlayers
          .filter((rp) => roundIdByNumber[rp.roundNumber])
          .map((rp) => ({
            roundId: roundIdByNumber[rp.roundNumber],
            steamId: rp.steamId,
            equipValue: rp.equipValue,
            money: rp.money,
            damage: rp.damage,
            buyType: mapBuyType(rp.buyType),
          })),
        skipDuplicates: true,
      });
    }

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
    await onProgress?.(90);

    // Replay data must be in the DB before anyone deletes the .dem.
    let replayStored = false;
    try {
      const stats = await parseAndPersistReplayData(prisma, match.id, filePath);
      replayStored = true;
      console.log(`[persist-demo] replay data match=${match.id}: ${formatReplayStats(stats)}`);
    } catch (error) {
      console.error(`[persist-demo] replay data FAILED match=${match.id}:`, error);
    }
    // Mechanics read the replay data just stored; a failure here is not fatal
    // (the mechanics page recomputes missing stats on first view).
    if (replayStored) {
      try {
        const players = await computeAndPersistMechanics(prisma, match.id);
        console.log(`[persist-demo] mechanics match=${match.id}: ${players} players`);
      } catch (error) {
        console.error(`[persist-demo] mechanics FAILED match=${match.id}:`, error);
      }
      try {
        const players = await computeAndPersistAim(prisma, match.id);
        console.log(`[persist-demo] aim match=${match.id}: ${players} players`);
      } catch (error) {
        console.error(`[persist-demo] aim FAILED match=${match.id}:`, error);
      }
      try {
        const roundWindows = parsed.rounds.map((r) => ({ number: r.number, startTick: r.startTick, endTick: r.endTick }));
        const samples = await parsePlaceSamples(filePath, roundWindows, match.tickRate);
        await persistPlaceCells(prisma, match.map, aggregatePlaces(samples));
        console.log(`[persist-demo] callouts match=${match.id}: ${samples.length} samples`);
      } catch (error) {
        console.error(`[persist-demo] callouts FAILED match=${match.id}:`, error);
      }
      try {
        const players = await computeAndPersistUtility(prisma, match.id);
        console.log(`[persist-demo] utility match=${match.id}: ${players} players`);
      } catch (error) {
        console.error(`[persist-demo] utility FAILED match=${match.id}:`, error);
      }
      try {
        const players = await computeAndPersistTactics(prisma, match.id);
        console.log(`[persist-demo] tactics match=${match.id}: ${players} players`);
      } catch (error) {
        console.error(`[persist-demo] tactics FAILED match=${match.id}:`, error);
      }
      try {
        const findings = await computeAndPersistFindings(prisma, match.id);
        console.log(`[persist-demo] findings match=${match.id}: ${findings}`);
      } catch (error) {
        console.error(`[persist-demo] findings FAILED match=${match.id}:`, error);
      }
    }
    // Ranks and norm samples (S13). Neither may fail the analysis.
    const upload = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { faceitMatchId: true, pro: true },
    });
    if (!upload?.pro) {
      try {
        const ticks = [parsed.rounds[0]?.startTick, parsed.rounds[parsed.rounds.length - 1]?.startTick].filter(
          (t): t is number => typeof t === "number" && t > 0
        );
        const ranked = await persistMatchRanks(prisma, match.id, {
          faceitMatchId: upload?.faceitMatchId ?? null,
          demoRanks: await parsePlayerRanks(filePath, ticks),
        });
        console.log(`[persist-demo] ranks match=${match.id}: ${ranked} players`);
      } catch (error) {
        console.error(`[persist-demo] ranks FAILED match=${match.id}:`, error);
      }
    }
    if (replayStored) {
      try {
        const samples = await computeAndPersistNormSamples(prisma, match.id, { pro: upload?.pro ?? false });
        // A new pro demo changes the pro norms at once; rank pools catch up periodically.
        if (upload?.pro) await refreshNorms(prisma);
        else await refreshNormsIfStale(prisma);
        console.log(`[persist-demo] norm samples match=${match.id}: ${samples}`);
      } catch (error) {
        console.error(`[persist-demo] norms FAILED match=${match.id}:`, error);
      }
    }
    await onProgress?.(98);

    // A second run of the same upload (a stalled job picked up again) replaces
    // the Match the first one linked; drop that one instead of orphaning it.
    const previous = await prisma.demoUpload.findUnique({
      where: { id: uploadId },
      select: { matchId: true },
    });
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: {
        status: "COMPLETED",
        matchId: match.id,
        progress: 100,
        parseMs: Date.now() - startedAt,
      },
    });
    createdMatchId = null;
    if (previous?.matchId && previous.matchId !== match.id) {
      await prisma.match.delete({ where: { id: previous.matchId } }).catch(() => {});
    }
    await onProgress?.(100);

    return { matchId: match.id, replayStored };
  } catch (error) {
    console.error(
      `[persist-demo] FAILED uploadId=${uploadId} filePath="${filePath}":`,
      error
    );
    if (createdMatchId) {
      // Rounds, players, events and replay data cascade with it.
      await prisma.match.delete({ where: { id: createdMatchId } }).catch((err) => {
        console.error(`[persist-demo] removing partial match=${createdMatchId} failed:`, err);
      });
    }
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

/**
 * Mark an upload FAILED if it is still in flight (QUEUED / DOWNLOADING /
 * PARSING) and not cancelled. Workers call it when BullMQ gives up on a job
 * (e.g. "job stalled more than allowable limit") without our own catch having
 * run, so the upload doesn't stay in flight forever and the player can retry.
 */
export async function failUploadIfInFlight(
  prisma: PrismaClient,
  uploadId: string,
  message: string
): Promise<void> {
  await prisma.demoUpload
    .updateMany({
      where: {
        id: uploadId,
        deletedAt: null,
        status: { in: ["QUEUED", "DOWNLOADING", "PARSING"] },
      },
      data: { status: "FAILED", error: message },
    })
    .catch(() => {});
}

async function linkUser(prisma: PrismaClient, steamId: string) {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { id: true },
  });
  return user ? { userId: user.id } : {};
}

function mapWinReason(
  reason: string
): "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSED" | "TIME_RAN_OUT" | "TARGET_SAVED" {
  const map: Record<
    string,
    "ELIMINATION" | "BOMB_EXPLODED" | "BOMB_DEFUSED" | "TIME_RAN_OUT" | "TARGET_SAVED"
  > = {
    ELIMINATION: "ELIMINATION",
    BOMB_EXPLODED: "BOMB_EXPLODED",
    BOMB_DEFUSED: "BOMB_DEFUSED",
    TIME_RAN_OUT: "TIME_RAN_OUT",
    TARGET_SAVED: "TARGET_SAVED",
  };
  return map[reason] ?? "ELIMINATION";
}

function mapBuyType(
  type: string
): "FULL_BUY" | "FORCE_BUY" | "ECO" | "HALF_BUY" | "PISTOL" | "UNKNOWN" {
  const map: Record<
    string,
    "FULL_BUY" | "FORCE_BUY" | "ECO" | "HALF_BUY" | "PISTOL" | "UNKNOWN"
  > = {
    FULL_BUY: "FULL_BUY",
    FORCE_BUY: "FORCE_BUY",
    ECO: "ECO",
    HALF_BUY: "HALF_BUY",
    PISTOL: "PISTOL",
    UNKNOWN: "UNKNOWN",
  };
  return map[type] ?? "UNKNOWN";
}

function mapBombAction(
  type: string
): "PLANT_BEGIN" | "PLANTED" | "DEFUSE_BEGIN" | "DEFUSED" | "EXPLODED" | "DROPPED" | "PICKED_UP" {
  const map: Record<
    string,
    "PLANT_BEGIN" | "PLANTED" | "DEFUSE_BEGIN" | "DEFUSED" | "EXPLODED" | "DROPPED" | "PICKED_UP"
  > = {
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
