import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { demoParseQueue } from "@/lib/queue";
import { checkMonthlyDemoLimit } from "@/lib/limits";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_FILE_SIZE = 700 * 1024 * 1024; // 700MB

function sanitizeFileName(name: string): string {
  // Keep alphanumerics, dots, hyphens, underscores. Replace everything else with _.
  // Defense in depth — the on-disk filename is a cuid, but the DB metadata
  // is sanitized so it can't break URLs or display layers downstream.
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.name.endsWith(".dem")) {
    return NextResponse.json({ error: "Only .dem files are accepted" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 700MB)" }, { status: 400 });
  }

  // Enforce the monthly demo limit (shared with FACEIT downloads)
  const limit = await checkMonthlyDemoLimit(session.user.id);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: `Monthly demo limit reached (${limit.used}/${limit.limit} on ${limit.plan} plan). Upgrade for more.`,
      },
      { status: 403 }
    );
  }

  const originalName = file.name;
  const safeName = sanitizeFileName(originalName);
  console.log(
    `[upload] received file="${originalName}" sanitized="${safeName}" size=${file.size}`
  );

  // Create upload record (store the sanitized name as DB metadata)
  const upload = await prisma.demoUpload.create({
    data: {
      userId: session.user.id,
      fileName: safeName,
      fileSize: file.size,
      fileUrl: "",
      status: "QUEUED",
    },
  });

  // Write file to disk under a cuid-derived name (filesystem-safe by construction)
  const demosDir = join(process.cwd(), "data", "demos");
  const filePath = join(demosDir, `${upload.id}.dem`);
  console.log(`[upload] writing demosDir="${demosDir}" filePath="${filePath}"`);

  try {
    await mkdir(demosDir, { recursive: true });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await writeFile(filePath, bytes);
  } catch (err) {
    console.error(`[upload] disk write failed: filePath="${filePath}"`, err);
    await prisma.demoUpload.update({
      where: { id: upload.id },
      data: {
        status: "FAILED",
        error: `Disk write failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
    return NextResponse.json(
      { error: "Failed to write demo to disk" },
      { status: 500 }
    );
  }

  // Update file URL
  await prisma.demoUpload.update({
    where: { id: upload.id },
    data: { fileUrl: filePath },
  });

  // Enqueue parse job
  await demoParseQueue.add("parse", {
    uploadId: upload.id,
    filePath,
    userId: session.user.id,
  });

  console.log(`[upload] queued parse job uploadId=${upload.id}`);

  return NextResponse.json({ uploadId: upload.id }, { status: 201 });
}
