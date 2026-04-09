import { prisma } from "@/lib/db/prisma";
import { demoParseQueue } from "@/lib/queue";
import { getMatchHistory, getMatchDetails } from "./api";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { createWriteStream } from "fs";

const SYNC_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const SEVEN_DAYS_S = 7 * 24 * 60 * 60;

interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

export async function syncFaceitMatches(userId: string): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

  // Load user
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { faceitId: true, lastFaceitSync: true },
  });

  if (!user?.faceitId) {
    return result;
  }

  // Throttle: skip if synced less than 1 hour ago
  if (
    user.lastFaceitSync &&
    Date.now() - user.lastFaceitSync.getTime() < SYNC_COOLDOWN_MS
  ) {
    return result;
  }

  // Determine "from" timestamp (last sync or 7 days ago)
  const fromTimestamp = user.lastFaceitSync
    ? Math.floor(user.lastFaceitSync.getTime() / 1000)
    : Math.floor(Date.now() / 1000) - SEVEN_DAYS_S;

  // Fetch match history
  let matches;
  try {
    matches = await getMatchHistory(user.faceitId, fromTimestamp);
  } catch (err) {
    result.errors.push(
      `Failed to fetch match history: ${err instanceof Error ? err.message : "Unknown error"}`
    );
    return result;
  }

  // Filter to finished matches only
  const finishedMatches = matches.filter((m) => m.status === "FINISHED");

  // Ensure demos directory exists
  const demosDir = join(process.cwd(), "data", "demos");
  await mkdir(demosDir, { recursive: true });

  for (const match of finishedMatches) {
    try {
      // Check if already synced
      const existing = await prisma.demoUpload.findUnique({
        where: { faceitMatchId: match.match_id },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      // Get match details for demo URL
      const details = await getMatchDetails(match.match_id);
      const demoUrl = details.demo_url?.[0];

      if (!demoUrl) {
        result.skipped++;
        continue;
      }

      // Create upload record first
      const upload = await prisma.demoUpload.create({
        data: {
          userId,
          fileName: `faceit_${match.match_id}.dem`,
          fileUrl: "",
          fileSize: 0,
          status: "QUEUED",
          source: "FACEIT",
          faceitMatchId: match.match_id,
        },
      });

      const filePath = join(demosDir, `${upload.id}.dem`);

      // Download and decompress demo
      try {
        await downloadDemo(demoUrl, filePath);
      } catch (dlErr) {
        // Clean up failed download
        await unlink(filePath).catch(() => {});
        await prisma.demoUpload.update({
          where: { id: upload.id },
          data: {
            status: "FAILED",
            error: `Download failed: ${dlErr instanceof Error ? dlErr.message : "Unknown error"}`,
          },
        });
        result.errors.push(
          `Match ${match.match_id}: download failed`
        );
        continue;
      }

      // Update upload with file path and size
      const { size } = await import("fs/promises").then((fs) =>
        fs.stat(filePath)
      );
      await prisma.demoUpload.update({
        where: { id: upload.id },
        data: { fileUrl: filePath, fileSize: size },
      });

      // Enqueue parse job
      await demoParseQueue.add("parse", {
        uploadId: upload.id,
        filePath,
        userId,
      });

      result.synced++;
    } catch (err) {
      result.errors.push(
        `Match ${match.match_id}: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  }

  // Update last sync timestamp
  await prisma.user.update({
    where: { id: userId },
    data: { lastFaceitSync: new Date() },
  });

  return result;
}

/**
 * Download a demo file from a URL. Handles .gz compressed files.
 */
async function downloadDemo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error("No response body");
  }

  const isGzip =
    url.endsWith(".gz") ||
    res.headers.get("content-type")?.includes("gzip") ||
    res.headers.get("content-encoding") === "gzip";

  const webStream = res.body;
  const nodeStream = Readable.fromWeb(webStream as Parameters<typeof Readable.fromWeb>[0]);

  if (isGzip) {
    const gunzip = createGunzip();
    const output = createWriteStream(destPath);
    await pipeline(nodeStream, gunzip, output);
  } else {
    const output = createWriteStream(destPath);
    await pipeline(nodeStream, output);
  }
}
