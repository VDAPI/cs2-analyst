/**
 * The analysis library: what the player keeps after their demos are gone.
 * Shared by the library API routes and the workers.
 */
import type { PrismaClient } from "@prisma/client";
import { deleteStoredDemo } from "./storage/demo-store";

/**
 * Delete an analysis: its match (rounds, events, replay data cascade), its
 * .dem, and the link to a FACEIT history entry, which becomes pickable again.
 * The upload row stays, marked deleted, so the monthly limit still counts it.
 */
export async function deleteAnalysis(prisma: PrismaClient, uploadId: string): Promise<void> {
  const upload = await prisma.demoUpload.findUnique({
    where: { id: uploadId },
    select: { fileUrl: true, matchId: true, demoDeletedAt: true },
  });
  if (!upload) return;

  if (!upload.demoDeletedAt) await deleteStoredDemo(upload.fileUrl);

  const now = new Date();
  await prisma.$transaction([
    prisma.faceitMatch.updateMany({
      where: { uploadId },
      data: { uploadId: null },
    }),
    prisma.steamMatch.updateMany({
      where: { uploadId },
      data: { uploadId: null },
    }),
    prisma.demoUpload.update({
      where: { id: uploadId },
      data: {
        deletedAt: now,
        demoDeletedAt: upload.demoDeletedAt ?? now,
        matchId: null,
        faceitMatchId: null,
        keepDemo: false,
      },
    }),
    ...(upload.matchId ? [prisma.match.delete({ where: { id: upload.matchId } })] : []),
  ]);
}

export type QueueStage = "queued" | "downloading" | "parsing" | "done" | "failed";

export function queueStage(status: string): QueueStage {
  switch (status) {
    case "DOWNLOADING":
      return "downloading";
    case "PARSING":
      return "parsing";
    case "COMPLETED":
      return "done";
    case "FAILED":
      return "failed";
    default:
      return "queued";
  }
}

/** Where the .dem of an analysis is, for the library's "demo" column. */
export type DemoState = "deleted" | "kept" | "pending_delete" | "stored";

export function demoState(u: {
  demoDeletedAt: Date | null;
  keepDemo: boolean;
  status: string;
}): DemoState {
  if (u.demoDeletedAt) return "deleted";
  if (u.keepDemo) return "kept";
  // Still on disk without "keep": analysis in flight, replay data failed to
  // store, retention set to keep, or an older analysis from before deletion.
  return u.status === "COMPLETED" ? "stored" : "pending_delete";
}

/** True when every round of the match has its replay data in the DB. */
export async function replayDataComplete(prisma: PrismaClient, matchId: string): Promise<boolean> {
  const [rounds, missing] = await Promise.all([
    prisma.round.count({ where: { matchId } }),
    prisma.round.count({ where: { matchId, ticks: null } }),
  ]);
  return rounds > 0 && missing === 0;
}

export interface QueueItem {
  id: string;
  label: string;
  map: string | null;
  source: "MANUAL" | "FACEIT" | "STEAM";
  stage: QueueStage;
  progress: number;
  error: string | null;
  matchId: string | null;
  createdAt: string;
}

/** Uploads shown on the queue screen: unfinished ones, plus the last day's. */
export async function getQueueItems(prisma: PrismaClient, userId: string): Promise<QueueItem[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const uploads = await prisma.demoUpload.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [{ status: { not: "COMPLETED" } }, { updatedAt: { gte: since } }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      fileName: true,
      source: true,
      status: true,
      progress: true,
      error: true,
      matchId: true,
      createdAt: true,
      match: { select: { map: true } },
      faceitMatch: { select: { map: true, date: true } },
      steamMatch: { select: { createdAt: true } },
    },
  });
  return uploads.map((u) => ({
    id: u.id,
    label: u.faceitMatch
      ? `FACEIT · ${u.faceitMatch.date.toISOString().slice(0, 10)}`
      : u.steamMatch
        ? `Premier · ${u.steamMatch.createdAt.toISOString().slice(0, 10)}`
        : u.fileName,
    map: u.match?.map ?? u.faceitMatch?.map ?? null,
    source: u.source,
    stage: queueStage(u.status),
    progress: u.progress,
    // A QUEUED upload's error is a retry note, not a failure.
    error: u.error,
    matchId: u.matchId,
    createdAt: u.createdAt.toISOString(),
  }));
}
