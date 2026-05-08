/**
 * Backfill per-player per-round economy + damage rows (RoundPlayer)
 * for matches parsed before Phase 1 was deployed.
 *
 * Idempotent: skips matches that already have RoundPlayer rows.
 * Run after `npx prisma migrate dev` has created the RoundPlayer table.
 *
 *   npx tsx scripts/backfill-round-players.ts
 */
import { PrismaClient } from "@prisma/client";
import { parseDemoFile } from "../src/lib/parsers/demo-parser";
import * as fs from "fs";

const prisma = new PrismaClient();

async function main() {
  const uploads = await prisma.demoUpload.findMany({
    where: { status: "COMPLETED", matchId: { not: null } },
    select: { id: true, fileName: true, matchId: true, source: true },
  });

  console.log(`Found ${uploads.length} completed uploads\n`);

  const demoDir = "data/demos";
  const demoFiles = fs.existsSync(demoDir)
    ? fs.readdirSync(demoDir).filter((f) => f.endsWith(".dem"))
    : [];
  console.log(`Demo files on disk: ${demoFiles.length}\n`);

  let backfilled = 0;
  let skippedHasData = 0;
  let skippedNoFile = 0;

  for (const upload of uploads) {
    if (!upload.matchId) continue;

    const existing = await prisma.roundPlayer.count({
      where: { round: { matchId: upload.matchId } },
    });
    if (existing > 0) {
      skippedHasData++;
      continue;
    }

    const demoFile = demoFiles.find((f) => f.startsWith(upload.id));
    if (!demoFile) {
      console.log(
        `  SKIP ${upload.id} (${upload.source}): demo file gone (${upload.fileName})`
      );
      skippedNoFile++;
      continue;
    }

    const filePath = `${demoDir}/${demoFile}`;
    console.log(`\nProcessing: ${upload.id} → match ${upload.matchId}`);

    const parsed = await parseDemoFile(filePath);
    console.log(`  Parsed: ${parsed.roundPlayers.length} round-player rows`);

    if (parsed.roundPlayers.length === 0) continue;

    const rounds = await prisma.round.findMany({
      where: { matchId: upload.matchId },
      select: { id: true, number: true },
    });
    const roundIdByNumber: Record<number, string> = {};
    for (const r of rounds) roundIdByNumber[r.number] = r.id;

    const data = parsed.roundPlayers
      .filter((rp) => roundIdByNumber[rp.roundNumber])
      .map((rp) => ({
        roundId: roundIdByNumber[rp.roundNumber],
        steamId: rp.steamId,
        equipValue: rp.equipValue,
        money: rp.money,
        damage: rp.damage,
        buyType: rp.buyType as
          | "FULL_BUY"
          | "FORCE_BUY"
          | "ECO"
          | "HALF_BUY"
          | "PISTOL"
          | "UNKNOWN",
      }));

    const result = await prisma.roundPlayer.createMany({
      data,
      skipDuplicates: true,
    });
    console.log(`  Inserted: ${result.count} rows`);
    backfilled++;
  }

  console.log(
    `\nDone. backfilled=${backfilled}, skipped(has data)=${skippedHasData}, skipped(no file)=${skippedNoFile}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
