/**
 * S28: how long one analysis takes, step by step.
 *
 *   npm run bench:parse -- <file.dem> [more.dem …] [--runs 2] [--keep]
 *   npm run bench:parse -- --fixture          # the E2E fixture demo
 *
 * Runs the real pipeline (`parseAndPersistDemo`) against DATABASE_URL as a
 * bench user, and prints per-step wall time, every demoparser2 call, the
 * number of SQL queries and peak RSS. The bench matches are deleted again
 * unless --keep.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const fixture = args.includes("--fixture");
if (fixture) process.env.E2E_FIXTURE_DEMOS = "1";
process.env.PARSE_PROFILE = "1";
const keep = args.includes("--keep");
const runsArg = args.indexOf("--runs");
const runs = runsArg >= 0 ? Math.max(1, Number(args[runsArg + 1]) || 1) : 1;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--runs");

const BENCH_EMAIL = "bench@cs2analyst.local";

async function main() {
  // Imported after the env is set: the parser is chosen on first load.
  const { parseAndPersistDemo, formatStepTimings } = await import("../src/lib/parsers/persist-demo");
  const { parserCallTimings } = await import("../src/lib/parsers/load-parser");

  if (fixture) {
    const { fixtureDemoText } = await import("../src/lib/parsers/fixture-demo");
    const path = join(await mkdtemp(join(tmpdir(), "bench-")), "fixture.dem");
    await writeFile(path, fixtureDemoText(1));
    files.push(path);
  }
  if (files.length === 0) {
    console.error("usage: npm run bench:parse -- <file.dem> [--runs N] [--keep] | --fixture");
    process.exit(2);
  }

  const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  let queries = 0;
  prisma.$on("query", () => {
    queries++;
  });
  const user = await prisma.user.upsert({
    where: { email: BENCH_EMAIL },
    update: {},
    create: { email: BENCH_EMAIL, name: "Bench" },
  });

  let peakRss = 0;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 50);

  for (const file of files) {
    for (let run = 1; run <= runs; run++) {
      parserCallTimings.length = 0;
      queries = 0;
      peakRss = process.memoryUsage().rss;
      const upload = await prisma.demoUpload.create({
        data: {
          userId: user.id,
          fileName: basename(file),
          fileUrl: file,
          fileSize: 0,
          keepDemo: true,
          demoDeletedAt: new Date(),
        },
      });
      const started = performance.now();
      const result = await parseAndPersistDemo(prisma, { uploadId: upload.id, filePath: file });
      const wall = performance.now() - started;
      peakRss = Math.max(peakRss, process.memoryUsage().rss);

      console.log(`\n=== ${basename(file)} run ${run}/${runs}: ${(wall / 1000).toFixed(2)} s ===`);
      console.log(`steps:   ${formatStepTimings(result.timings)}`);
      console.log(`queries: ${queries}   peak RSS: ${(peakRss / 1024 / 1024).toFixed(0)} MB`);
      const parserTotal = parserCallTimings.reduce((s, t) => s + t.ms, 0);
      console.log(`parser:  ${parserCallTimings.length} calls, ${(parserTotal / 1000).toFixed(2)} s`);
      for (const t of parserCallTimings) {
        console.log(`  ${(t.ms / 1000).toFixed(2).padStart(6)} s  ${t.method} ${t.detail}`);
      }
      if (!keep) {
        await prisma.match.delete({ where: { id: result.matchId } }).catch(() => {});
        await prisma.demoUpload.delete({ where: { id: upload.id } }).catch(() => {});
      }
    }
  }
  clearInterval(sampler);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
