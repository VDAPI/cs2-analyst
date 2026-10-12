/**
 * Store replay data for matches parsed before it existed, while their .dem is
 * still on disk. Used by scripts/backfill-replay-ticks.ts and automatically by
 * the parse worker on startup.
 */
import type { PrismaClient } from "@prisma/client";
import { access } from "fs/promises";
import { parseDemoLocation } from "../storage/demo-store";
import { formatReplayStats, parseAndPersistReplayData } from "./persist-replay";

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
      upload: { select: { fileUrl: true } },
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
    // Only local files: an R2 demo was stored after replay data existed.
    const loc = parseDemoLocation(m.upload!.fileUrl);
    const filePath = loc.kind === "local" ? loc.path : "";
    if (!filePath || !(await access(filePath).then(() => true, () => false))) {
      log(`  NO FILE ${m.id} (${m.map}): ${filePath}`);
      result.missingFile++;
      continue;
    }
    try {
      const started = Date.now();
      const stats = await parseAndPersistReplayData(prisma, m.id, filePath);
      result.totalBytes += stats.tickBytes;
      result.done++;
      log(
        `  OK ${m.id} (${m.map}): ${formatReplayStats(stats)} in ${((Date.now() - started) / 1000).toFixed(1)}s`
      );
    } catch (err) {
      result.failed++;
      log(`  FAIL ${m.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
