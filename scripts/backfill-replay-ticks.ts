/**
 * Backfill replay data (RoundTicks, ShotEvent, DamageEvent) for matches parsed
 * before it was stored, while their .dem is still on disk. Once a match has it,
 * the 2D replay no longer needs the demo file.
 *
 * Run: npm run backfill:replay [-- --match <matchId>] [-- --force]
 *   --match  only this match
 *   --force  re-parse matches that already have replay data
 *
 * Prints the stored size per match, so it doubles as the storage measurement.
 */
import { PrismaClient } from "@prisma/client";
import { access } from "fs/promises";
import { formatReplayStats, parseAndPersistReplayData } from "../src/lib/parsers/persist-replay";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const onlyMatch = arg("--match");
  const force = process.argv.includes("--force");

  const matches = await prisma.match.findMany({
    where: { upload: { isNot: null }, ...(onlyMatch ? { id: onlyMatch } : {}) },
    select: {
      id: true,
      map: true,
      upload: { select: { fileUrl: true } },
      rounds: { select: { ticks: { select: { id: true } } } },
    },
  });
  console.log(`Matches: ${matches.length}\n`);

  let done = 0;
  let skipped = 0;
  let missingFile = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const m of matches) {
    const complete = m.rounds.length > 0 && m.rounds.every((r) => r.ticks);
    if (complete && !force) {
      skipped++;
      continue;
    }
    const filePath = m.upload!.fileUrl.replace(/\\/g, "/");
    if (!(await access(filePath).then(() => true, () => false))) {
      console.log(`  NO FILE ${m.id} (${m.map}): ${filePath}`);
      missingFile++;
      continue;
    }
    try {
      const started = Date.now();
      const stats = await parseAndPersistReplayData(prisma, m.id, filePath);
      totalBytes += stats.tickBytes;
      done++;
      console.log(
        `  OK ${m.id} (${m.map}): ${formatReplayStats(stats)} in ${((Date.now() - started) / 1000).toFixed(1)}s`
      );
    } catch (err) {
      failed++;
      console.error(`  FAIL ${m.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `\nBackfilled ${done}, already stored ${skipped}, no demo file ${missingFile}, failed ${failed}`
  );
  if (done > 0) {
    console.log(`Average tick data per match: ${(totalBytes / done / 1024).toFixed(0)} KiB`);
  }
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
