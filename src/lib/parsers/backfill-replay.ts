/**
 * Store replay data for matches parsed before it existed, or whose replay step
 * failed, while their .dem is still kept (local disk or R2). Used by
 * scripts/backfill-replay-ticks.ts and automatically by the parse worker on
 * startup.
 */
import type { PrismaClient } from "@prisma/client";
import { access } from "fs/promises";
import { finalizeDemoAfterAnalysis, openDemoForParsing, parseDemoLocation } from "../storage/demo-store";
import { formatReplayStats, parseAndPersistReplayData } from "./persist-replay";
import { computeAndPersistMechanics } from "../analysis/persist-mechanics";
import { computeAndPersistAim } from "../analysis/persist-aim";
import { computeAndPersistUtility } from "../analysis/persist-utility";
import { computeAndPersistTactics } from "../analysis/persist-tactics";
import { computeAndPersistFindings } from "../findings/persist";
import { computeAndPersistNormSamples } from "../norms/persist";

export interface BackfillResult {
  done: number;
  skipped: number;
  missingFile: number;
  failed: number;
  totalBytes: number;
}

export async function backfillReplayData(
  prisma: PrismaClient,
  opts: { matchId?: string; force?: boolean } = {},
  log: (line: string) => void = console.log
): Promise<BackfillResult> {
  const matches = await prisma.match.findMany({
    // COMPLETED only: an upload still PARSING gets its replay data from the
    // parse itself.
    where: {
      upload: { is: { status: "COMPLETED", demoDeletedAt: null } },
      ...(opts.matchId ? { id: opts.matchId } : {}),
    },
    select: {
      id: true,
      map: true,
      upload: { select: { id: true, fileUrl: true, pro: true } },
      rounds: { select: { ticks: { select: { id: true } } } },
    },
  });

  const result: BackfillResult = { done: 0, skipped: 0, missingFile: 0, failed: 0, totalBytes: 0 };

  for (const m of matches) {
    const complete = m.rounds.length > 0 && m.rounds.every((r) => r.ticks);
    if (complete && !opts.force) {
      result.skipped++;
      continue;
    }
    // Local files, and R2 demos too: a demo is kept in R2 exactly when its
    // replay step failed, so it is the one that needs this.
    const upload = m.upload!;
    const loc = parseDemoLocation(upload.fileUrl);
    const missing =
      loc.kind === "none" ||
      (loc.kind === "local" && !(await access(loc.path).then(() => true, () => false)));
    if (missing) {
      log(`  NO FILE ${m.id} (${m.map}): ${upload.fileUrl}`);
      result.missingFile++;
      continue;
    }
    try {
      const started = Date.now();
      const demo = await openDemoForParsing(upload.id, upload.fileUrl);
      let stats;
      try {
        stats = await parseAndPersistReplayData(prisma, m.id, demo.path);
      } finally {
        await demo.cleanup();
      }
      result.totalBytes += stats.tickBytes;
      result.done++;
      log(
        `  OK ${m.id} (${m.map}): ${formatReplayStats(stats)} in ${((Date.now() - started) / 1000).toFixed(1)}s`
      );
      // The stored analyses came from the old (or missing) replay data and keep
      // their version numbers, so nothing would rebuild them: do it now.
      await rebuildDerivedAnalysis(prisma, m.id, upload.pro, log);
      // Replay data is in the DB now: the usual rule decides whether the .dem goes.
      await finalizeDemoAfterAnalysis(prisma, upload.id, true).catch((err) => {
        log(`  demo cleanup failed ${m.id}: ${err instanceof Error ? err.message : String(err)}`);
      });
    } catch (err) {
      result.failed++;
      log(`  FAIL ${m.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/** What parseAndPersistDemo derives from replay data; each step may fail alone. */
async function rebuildDerivedAnalysis(
  prisma: PrismaClient,
  matchId: string,
  pro: boolean,
  log: (line: string) => void
): Promise<void> {
  const steps: [string, () => Promise<unknown>][] = [
    ["mechanics", () => computeAndPersistMechanics(prisma, matchId)],
    ["aim", () => computeAndPersistAim(prisma, matchId)],
    ["utility", () => computeAndPersistUtility(prisma, matchId)],
    ["tactics", () => computeAndPersistTactics(prisma, matchId)],
    ["findings", () => computeAndPersistFindings(prisma, matchId)],
    ["norm samples", () => computeAndPersistNormSamples(prisma, matchId, { pro })],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      log(`  ${name} FAILED ${matchId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
