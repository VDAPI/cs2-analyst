/**
 * Sample every analysed match that has no norm samples yet and rebuild all
 * norms (S13). The parse worker does this on its own (startup backfill, then
 * after every analysis); this is for running it by hand.
 *
 * Run: npm run norms:refresh
 */
import { PrismaClient } from "@prisma/client";
import { backfillNormSamples, proPoolSize, refreshNorms } from "../src/lib/norms/persist";

const prisma = new PrismaClient();

async function main() {
  const sampled = await backfillNormSamples(prisma, {
    limit: 100_000,
    log: (line) => console.log(`[norms]${line}`),
  });
  const cells = await refreshNorms(prisma);
  const pool = await proPoolSize(prisma);
  console.log(`Sampled ${sampled} matches. Norm cells: ${cells}. Pro pool: ${pool.matches} demos, ${pool.players} player-matches.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
