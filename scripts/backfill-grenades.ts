/**
 * Backfill grenade events for existing matches that were parsed
 * before grenade extraction was implemented.
 */
import { PrismaClient } from "@prisma/client";
import { parseDemoFile } from "../src/lib/parsers/demo-parser";
import * as fs from "fs";

const prisma = new PrismaClient();

async function main() {
  // Find all completed uploads with demo files
  const uploads = await prisma.demoUpload.findMany({
    where: { status: "COMPLETED", matchId: { not: null } },
    select: { id: true, fileName: true, matchId: true },
  });

  console.log(`Found ${uploads.length} completed uploads\n`);

  // Map demo files in data/demos/
  const demoDir = "data/demos";
  const demoFiles = fs.readdirSync(demoDir).filter((f) => f.endsWith(".dem"));
  console.log(`Demo files on disk: ${demoFiles.length}`);

  for (const upload of uploads) {
    if (!upload.matchId) continue;

    // Find the demo file — try upload ID as prefix
    const demoFile = demoFiles.find((f) => f.startsWith(upload.id));
    if (!demoFile) {
      console.log(`  SKIP ${upload.id}: no demo file found (${upload.fileName})`);
      continue;
    }

    const filePath = `${demoDir}/${demoFile}`;
    console.log(`\nProcessing: ${upload.id} → match ${upload.matchId}`);
    console.log(`  File: ${filePath}`);

    // Check if grenades already exist for this match
    const existing = await prisma.grenadeEvent.count({
      where: { round: { matchId: upload.matchId } },
    });
    if (existing > 0) {
      console.log(`  SKIP: already has ${existing} grenade events`);
      continue;
    }

    // Parse the demo
    const parsed = await parseDemoFile(filePath);
    console.log(`  Parsed: ${parsed.grenades.length} grenades`);

    if (parsed.grenades.length === 0) continue;

    // Get round ID mapping for this match
    const rounds = await prisma.round.findMany({
      where: { matchId: upload.matchId },
      select: { id: true, number: true },
    });
    const roundIdByNumber: Record<number, string> = {};
    for (const r of rounds) roundIdByNumber[r.number] = r.id;

    // Insert grenades
    const data = parsed.grenades
      .filter((g) => roundIdByNumber[g.roundNumber])
      .map((g) => ({
        roundId: roundIdByNumber[g.roundNumber],
        tick: g.tick,
        throwerSteamId: g.throwerSteamId,
        throwerName: g.throwerName,
        grenadeType: g.type as "SMOKE" | "FLASH" | "HE" | "MOLOTOV" | "INCENDIARY" | "DECOY",
        throwPosX: g.throwPos.x,
        throwPosY: g.throwPos.y,
        throwPosZ: g.throwPos.z,
        landPosX: g.landPos.x,
        landPosY: g.landPos.y,
        landPosZ: g.landPos.z,
        duration: g.duration ?? null,
        damageDealt: g.damageDealt,
        playersFlashed: g.playersFlashed,
      }));

    const result = await prisma.grenadeEvent.createMany({ data });
    console.log(`  Inserted: ${result.count} grenade events`);
  }

  // Also backfill economy data (ctMoney, tMoney, buyType) if missing
  const roundsWithZeroEcon = await prisma.round.count({
    where: { ctEquipVal: 0, tEquipVal: 0 },
  });
  if (roundsWithZeroEcon > 0) {
    console.log(`\n--- Economy backfill needed: ${roundsWithZeroEcon} rounds with zero economy ---`);

    for (const upload of uploads) {
      if (!upload.matchId) continue;
      const demoFile = demoFiles.find((f) => f.startsWith(upload.id));
      if (!demoFile) continue;

      const filePath = `${demoDir}/${demoFile}`;
      const parsed = await parseDemoFile(filePath);

      for (const r of parsed.rounds) {
        if (r.ctEquipValue === 0 && r.tEquipValue === 0) continue;
        await prisma.round.updateMany({
          where: { matchId: upload.matchId, number: r.number },
          data: {
            ctEquipVal: r.ctEquipValue,
            tEquipVal: r.tEquipValue,
            ctMoney: r.ctMoney,
            tMoney: r.tMoney,
            buyType_CT: r.buyTypeCT as "FULL_BUY" | "FORCE_BUY" | "ECO" | "HALF_BUY" | "PISTOL" | "UNKNOWN",
            buyType_T: r.buyTypeT as "FULL_BUY" | "FORCE_BUY" | "ECO" | "HALF_BUY" | "PISTOL" | "UNKNOWN",
          },
        });
      }
      console.log(`  Updated economy for match ${upload.matchId}`);
    }
  }

  console.log("\nDone!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
