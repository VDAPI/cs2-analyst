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

interface PersistArgs {
  uploadId: string;
  filePath: string;
}

/**
 * @param onProgress optional 0-100 progress reporter (e.g. job.updateProgress)
 * @returns the created match id
 * On failure, sets the upload to FAILED and rethrows.
 */
export async function parseAndPersistDemo(
  prisma: PrismaClient,
  { uploadId, filePath }: PersistArgs,
  onProgress?: (pct: number) => void | Promise<void>
): Promise<{ matchId: string }> {
  try {
    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "PARSING" },
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
            firstKills: p.firstKills,
            firstDeaths: p.firstDeaths,
            ...playerUserLinks[i],
          })),
        },
      },
    });
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
    await onProgress?.(95);

    await prisma.demoUpload.update({
      where: { id: uploadId },
      data: { status: "COMPLETED", matchId: match.id },
    });
    await onProgress?.(100);

    return { matchId: match.id };
  } catch (error) {
    console.error(
      `[persist-demo] FAILED uploadId=${uploadId} filePath="${filePath}":`,
      error
    );
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
