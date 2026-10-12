/**
 * Where .dem files live, and when they are deleted.
 *
 * A demo is stored either on local disk (data/demos/<uploadId>.dem) or, when
 * R2 is configured, in Cloudflare R2 under demos/<uploadId>.dem.
 * DemoUpload.fileUrl records which: a local path, or "r2://<key>".
 *
 * After an analysis the .dem is deleted (report + replay data stay in the
 * DB) unless the player marked the match "keep demo", the replay data failed
 * to store, or DEMO_RETENTION=keep is set (handy on a dev machine that needs
 * demos to test parser changes against).
 */
import type { PrismaClient } from "@prisma/client";
import { copyFile, mkdir, rename, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getR2Config, r2Delete, r2GetToFile, r2PutFile } from "./r2";

export const LOCAL_DEMO_DIR = join(process.cwd(), "data", "demos");
const R2_PREFIX = "r2://";

export type DemoLocation =
  | { kind: "local"; path: string }
  | { kind: "r2"; key: string }
  | { kind: "none" };

export function parseDemoLocation(fileUrl: string | null | undefined): DemoLocation {
  if (!fileUrl) return { kind: "none" };
  if (fileUrl.startsWith(R2_PREFIX)) return { kind: "r2", key: fileUrl.slice(R2_PREFIX.length) };
  // demoparser2 (Rust) needs forward-slash paths to avoid "IllegalPathOp" on Windows.
  return { kind: "local", path: fileUrl.replace(/\\/g, "/") };
}

export function isR2Enabled(): boolean {
  return getR2Config() !== null;
}

export type DemoRetention = "delete" | "keep";

export function demoRetention(): DemoRetention {
  return process.env.DEMO_RETENTION === "keep" ? "keep" : "delete";
}

/**
 * The deletion rule in one place. The .dem goes only once the replay data is
 * safely in the DB — otherwise the 2D replay would be lost with it.
 */
export function shouldDeleteDemo(opts: {
  replayStored: boolean;
  keepDemo: boolean;
  retention: DemoRetention;
}): boolean {
  return opts.replayStored && !opts.keepDemo && opts.retention === "delete";
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    // tmpdir is often another filesystem than data/demos.
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await copyFile(src, dest);
    await unlink(src);
  }
}

/**
 * Move a demo that is on local disk (fresh upload, FACEIT download) into the
 * store. The source file is gone afterwards. Returns the new fileUrl.
 */
export async function storeDemoFile(uploadId: string, srcPath: string): Promise<string> {
  const r2 = getR2Config();
  if (r2) {
    const key = `demos/${uploadId}.dem`;
    await r2PutFile(r2, key, srcPath);
    await unlink(srcPath).catch(() => {});
    return `${R2_PREFIX}${key}`;
  }
  await mkdir(LOCAL_DEMO_DIR, { recursive: true });
  const dest = join(LOCAL_DEMO_DIR, `${uploadId}.dem`);
  if (dest !== srcPath) await moveFile(srcPath, dest);
  return dest;
}

/**
 * Get a local path the parser can read. R2 demos are downloaded to a temp
 * file; call cleanup() once parsing is done.
 */
export async function openDemoForParsing(
  uploadId: string,
  fileUrl: string
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const loc = parseDemoLocation(fileUrl);
  if (loc.kind === "local") return { path: loc.path, cleanup: async () => {} };
  if (loc.kind === "none") throw new Error("Demo file is missing");
  const r2 = getR2Config();
  if (!r2) throw new Error("Demo is in R2 but R2 is not configured");
  const path = join(tmpdir(), `${uploadId}-r2.dem`);
  await r2GetToFile(r2, loc.key, path);
  return { path, cleanup: () => unlink(path).catch(() => {}) };
}

/** Remove a stored demo. Missing files count as removed. */
export async function deleteStoredDemo(fileUrl: string | null | undefined): Promise<void> {
  const loc = parseDemoLocation(fileUrl);
  if (loc.kind === "local") {
    await unlink(loc.path).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  } else if (loc.kind === "r2") {
    const r2 = getR2Config();
    if (!r2) throw new Error("Demo is in R2 but R2 is not configured");
    await r2Delete(r2, loc.key);
  }
}

/** Delete an upload's .dem now and record it. No-op if already gone. */
export async function deleteUploadDemo(prisma: PrismaClient, uploadId: string): Promise<void> {
  const upload = await prisma.demoUpload.findUnique({
    where: { id: uploadId },
    select: { fileUrl: true, demoDeletedAt: true },
  });
  if (!upload || upload.demoDeletedAt) return;
  await deleteStoredDemo(upload.fileUrl);
  await prisma.demoUpload.update({
    where: { id: uploadId },
    data: { demoDeletedAt: new Date() },
  });
}

/**
 * Run after every analysis, by both workers. Re-reads keepDemo, since the
 * player may have toggled it while the demo was queued.
 */
export async function finalizeDemoAfterAnalysis(
  prisma: PrismaClient,
  uploadId: string,
  replayStored: boolean
): Promise<"deleted" | "kept"> {
  const upload = await prisma.demoUpload.findUnique({
    where: { id: uploadId },
    select: { keepDemo: true },
  });
  if (!upload) return "kept";
  if (!shouldDeleteDemo({ replayStored, keepDemo: upload.keepDemo, retention: demoRetention() })) {
    return "kept";
  }
  await deleteUploadDemo(prisma, uploadId);
  return "deleted";
}
