import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { demoParseQueue } from "@/lib/queue";
import {
  checkMonthlyDemoLimit,
  keepDemoSlotsLeft,
  limitReachedMessage,
  withUploadSlots,
} from "@/lib/limits";
import { LOCAL_DEMO_DIR, storeDemoFile } from "@/lib/storage/demo-store";
import { classifyDemoHeader, DEMO_HEADER_BYTES, demoHeaderError } from "@/lib/security/demo-file";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { activeUploadId, FACEIT_UPLOAD_INCLUDE, releaseFaceitMatch } from "@/lib/faceit/analyze";
import { getQueueItems } from "@/lib/library";
import { activeSteamUploadId, releaseSteamMatch, STEAM_UPLOAD_INCLUDE } from "@/lib/steam/premier";
import { mkdir, unlink } from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { join } from "path";

const MAX_FILE_SIZE = 700 * 1024 * 1024; // 700MB
/** The file plus multipart headers and the small form fields. */
const MAX_BODY_SIZE = MAX_FILE_SIZE + 1024 * 1024;

function sanitizeFileName(name: string): string {
  // Keep alphanumerics, dots, hyphens, underscores. Replace everything else with _.
  // Defense in depth — the on-disk filename is a cuid, but the DB metadata
  // is sanitized so it can't break URLs or display layers downstream.
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

/**
 * POST /api/uploads — multipart: file (.dem), optional keepDemo ("true"),
 * optional faceitMatch (FaceitMatch.id) to attach the demo to a match from
 * the player's FACEIT history, optional steamMatch (SteamMatch.id) to attach
 * it to a Premier match the player added.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const limited = await rateLimit("upload", userId);
  if (limited) return limited;

  // req.formData() buffers the whole body in memory, so refuse oversize (or
  // unsized, chunked) bodies before reading a byte. Node enforces the
  // declared Content-Length, so this bounds what formData() can buffer.
  const contentLength = Number(req.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return NextResponse.json({ error: "Missing Content-Length" }, { status: 411 });
  }
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ error: "File too large (max 700MB)" }, { status: 413 });
  }
  // Cheap check first: a player over the monthly limit never uploads the body.
  const earlyLimit = await checkMonthlyDemoLimit(userId);
  if (!earlyLimit.allowed) {
    return NextResponse.json({ error: limitReachedMessage(earlyLimit) }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const wantKeepDemo = formData.get("keepDemo") === "true";
  const faceitMatchRef = formData.get("faceitMatch");
  const steamMatchRef = formData.get("steamMatch");

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".dem")) {
    return NextResponse.json({ error: "Only .dem files are accepted" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 700MB)" }, { status: 400 });
  }

  // The name says .dem; the first bytes must say so too (CS2 magic), so a
  // renamed archive or a CS:GO demo never reaches the disk or the parser.
  const head = new Uint8Array(await file.slice(0, DEMO_HEADER_BYTES).arrayBuffer());
  const headerError = demoHeaderError(classifyDemoHeader(head));
  if (headerError) {
    return NextResponse.json({ error: headerError }, { status: 400 });
  }

  // Optional link to a FACEIT history entry (upload fallback for "Analyze
  // selected" when automatic downloads aren't available).
  let faceitMatchId: string | null = null;
  if (typeof faceitMatchRef === "string" && faceitMatchRef) {
    const fm = await prisma.faceitMatch.findUnique({
      where: { id: faceitMatchRef },
      include: FACEIT_UPLOAD_INCLUDE,
    });
    if (!fm || fm.userId !== userId) {
      return NextResponse.json({ error: "FACEIT match not found" }, { status: 404 });
    }
    if (activeUploadId(fm)) {
      return NextResponse.json(
        { error: "This FACEIT match already has a demo" },
        { status: 409 }
      );
    }
    faceitMatchId = fm.faceitMatchId;
  }

  // Optional link to a Premier match from /premier.
  let steamMatchId: string | null = null;
  if (!faceitMatchId && typeof steamMatchRef === "string" && steamMatchRef) {
    const sm = await prisma.steamMatch.findUnique({
      where: { id: steamMatchRef },
      include: STEAM_UPLOAD_INCLUDE,
    });
    if (!sm || sm.userId !== userId) {
      return NextResponse.json({ error: "Premier match not found" }, { status: 404 });
    }
    if (activeSteamUploadId(sm)) {
      return NextResponse.json({ error: "This Premier match already has a demo" }, { status: 409 });
    }
    steamMatchId = sm.id;
  }

  const originalName = file.name;
  const safeName = sanitizeFileName(originalName);
  console.log(
    `[upload] received file="${originalName}" sanitized="${safeName}" size=${file.size}`
  );

  // Enforce the monthly demo limit and the "keep demo" cap (shared with
  // FACEIT/Premier downloads), then create the upload record (sanitized name
  // as DB metadata) and claim the FACEIT/Premier match — one step per user,
  // so parallel uploads can't all take the same last slot or the same match.
  const reserved = await withUploadSlots(userId, async (tx, usage) => {
    if (!usage.allowed) return { error: limitReachedMessage(usage), status: 403 } as const;

    if (faceitMatchId) {
      const fm = await tx.faceitMatch.findUnique({
        where: { userId_faceitMatchId: { userId, faceitMatchId } },
        include: FACEIT_UPLOAD_INCLUDE,
      });
      if (!fm || activeUploadId(fm)) {
        return { error: "This FACEIT match already has a demo", status: 409 } as const;
      }
      if (fm.upload) await releaseFaceitMatch(userId, fm.faceitMatchId, tx);
    }
    if (steamMatchId) {
      const sm = await tx.steamMatch.findUnique({
        where: { id: steamMatchId },
        include: STEAM_UPLOAD_INCLUDE,
      });
      if (!sm || activeSteamUploadId(sm)) {
        return { error: "This Premier match already has a demo", status: 409 } as const;
      }
      if (sm.upload) await releaseSteamMatch(sm.id, tx);
    }

    // Over the plan's "keep demo" cap the analysis still runs, without keeping the .dem.
    const keepDemo = wantKeepDemo && keepDemoSlotsLeft(usage) > 0;
    const created = await tx.demoUpload.create({
      data: {
        userId,
        fileName: safeName,
        fileSize: file.size,
        fileUrl: "",
        status: "QUEUED",
        keepDemo,
        ...(faceitMatchId ? { source: "FACEIT" as const, faceitMatchId } : {}),
        ...(steamMatchId ? { source: "STEAM" as const } : {}),
      },
    });
    if (steamMatchId) {
      await tx.steamMatch.update({
        where: { id: steamMatchId },
        data: { uploadId: created.id },
      });
    }
    if (faceitMatchId) {
      await tx.faceitMatch.update({
        where: { userId_faceitMatchId: { userId, faceitMatchId } },
        data: { uploadId: created.id },
      });
    }
    return { upload: created, keepDemo } as const;
  });
  if ("error" in reserved) {
    return NextResponse.json({ error: reserved.error }, { status: reserved.status });
  }
  const { upload, keepDemo } = reserved;

  // Write file to disk under a cuid-derived name (filesystem-safe by
  // construction), then hand it to the demo store (moves it to R2 if set up).
  const filePath = join(LOCAL_DEMO_DIR, `${upload.id}.dem`);
  let fileUrl: string;
  try {
    await mkdir(LOCAL_DEMO_DIR, { recursive: true });
    // Stream to disk instead of arrayBuffer(), which made a second full copy.
    await pipeline(
      Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(filePath)
    );
    fileUrl = await storeDemoFile(upload.id, filePath);
  } catch (err) {
    console.error(`[upload] storing demo failed: filePath="${filePath}"`, err);
    await unlink(filePath).catch(() => {});
    await prisma.demoUpload.update({
      where: { id: upload.id },
      data: {
        status: "FAILED",
        // Details (paths, R2 errors) stay in the server log above.
        error: "Storing the demo failed",
      },
    });
    return NextResponse.json({ error: "Failed to store the demo" }, { status: 500 });
  }

  await prisma.demoUpload.update({
    where: { id: upload.id },
    data: { fileUrl },
  });

  // Enqueue parse job
  await demoParseQueue.add("parse", {
    uploadId: upload.id,
    filePath: fileUrl,
    userId,
  });

  console.log(`[upload] queued parse job uploadId=${upload.id} fileUrl="${fileUrl}"`);

  return NextResponse.json(
    // keepDemoIgnored: "keep demo" was asked for but the plan's cap is reached.
    { uploadId: upload.id, keepDemo, keepDemoIgnored: wantKeepDemo && !keepDemo },
    { status: 201 }
  );
}

/** GET /api/uploads — the analysis queue (unfinished + last day's uploads). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ items: await getQueueItems(prisma, session.user.id) });
}
