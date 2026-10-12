/**
 * Import pro demos into the pro pool (S13) and rebuild the norms. Parses each
 * .dem in the folder with the same pipeline as a player's upload (no Redis or
 * worker needed), then refreshes every norm.
 *
 * Run: npm run pro:import [-- <folder>] [-- --label "IEM Cologne 2026"]
 *   folder   default data/pro-demos/
 *   --label  prefix for every demo's label (the file name is appended)
 *
 * Files already in the pool (same file name, not deleted) are skipped. The
 * demos in the folder are left untouched; only the stored analysis is kept.
 * Pick demos you are allowed to use: HLTV's terms forbid scraping and
 * business use, so this script never downloads anything.
 */
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parseAndPersistDemo } from "../src/lib/parsers/persist-demo";
import { getProPoolUserId, labelFromFileName, sanitizeLabel } from "../src/lib/norms/pro-pool";
import { backfillNormSamples, proPoolSize, refreshNorms } from "../src/lib/norms/persist";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--label");
  const folder = resolve(positional[0] ?? join("data", "pro-demos"));
  const prefix = sanitizeLabel(arg("--label"));
  const files = (await readdir(folder)).filter((f) => f.toLowerCase().endsWith(".dem")).sort();
  if (files.length === 0) {
    console.log(`No .dem files in ${folder}`);
    return;
  }
  const userId = await getProPoolUserId(prisma);
  const existing = new Set(
    (
      await prisma.demoUpload.findMany({
        where: { pro: true, deletedAt: null, status: "COMPLETED" },
        select: { fileName: true },
      })
    ).map((u) => u.fileName)
  );

  let done = 0;
  let failed = 0;
  for (const file of files) {
    const fileName = file.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
    if (existing.has(fileName)) {
      console.log(`skip ${file} (already in the pool)`);
      continue;
    }
    const path = join(folder, file);
    const { size } = await stat(path);
    const label = [prefix, labelFromFileName(file)].filter(Boolean).join(" · ");
    const upload = await prisma.demoUpload.create({
      // demoDeletedAt from the start: the .dem is the admin's file, so deleting
      // the analysis (even after a failed parse) must never remove it.
      data: {
        userId, fileName, fileSize: size, fileUrl: path, status: "QUEUED", pro: true, proLabel: label, keepDemo: true,
        demoDeletedAt: new Date(),
      },
    });
    const started = Date.now();
    try {
      const r = await parseAndPersistDemo(prisma, { uploadId: upload.id, filePath: path });
      console.log(`ok   ${file} → match ${r.matchId} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
      done++;
    } catch (err) {
      console.error(`FAIL ${file}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  // Older pro matches (analysed before a version bump) get fresh samples too.
  await backfillNormSamples(prisma, { limit: 1000 });
  const cells = await refreshNorms(prisma);
  const pool = await proPoolSize(prisma);
  console.log(`\nImported ${done}, failed ${failed}. Pro pool: ${pool.matches} demos, ${pool.players} player-matches. Norm cells: ${cells}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
