/**
 * Backfill replay data (RoundTicks, ShotEvent, DamageEvent) for matches parsed
 * before it was stored, while their .dem is still on disk. Once a match has it,
 * the 2D replay no longer needs the demo file.
 *
 * The parse worker already does this on startup; this script is for running
 * it by hand.
 *
 * Run: npm run backfill:replay [-- --match <matchId>] [-- --force]
 *   --match  only this match
 *   --force  re-parse matches that already have replay data
 *
 * Prints the stored size per match, so it doubles as the storage measurement.
 */
import { PrismaClient } from "@prisma/client";
import { backfillReplayData } from "../src/lib/parsers/backfill-replay";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const r = await backfillReplayData(prisma, {
    matchId: arg("--match"),
    force: process.argv.includes("--force"),
  });
  console.log(
    `\nBackfilled ${r.done}, already stored ${r.skipped}, no demo file ${r.missingFile}, failed ${r.failed}`
  );
  if (r.done > 0) {
    console.log(`Average tick data per match: ${(r.totalBytes / r.done / 1024).toFixed(0)} KiB`);
  }
  if (r.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
