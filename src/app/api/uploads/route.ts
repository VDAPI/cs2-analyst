import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { demoParseQueue } from "@/lib/queue";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300MB

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
    return NextResponse.json({ error: "File too large (max 300MB)" }, { status: 400 });
  }

  // Create upload record
  const upload = await prisma.demoUpload.create({
    data: {
      userId: session.user.id,
      fileName: file.name,
      fileSize: file.size,
      fileUrl: "", // will be updated after write
      status: "QUEUED",
    },
  });

  // Write file to disk
  const demosDir = join(process.cwd(), "data", "demos");
  await mkdir(demosDir, { recursive: true });
  const filePath = join(demosDir, `${upload.id}.dem`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(filePath, bytes);

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

  return NextResponse.json({ uploadId: upload.id }, { status: 201 });
}
