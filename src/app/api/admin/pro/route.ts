import { NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { demoParseQueue } from "@/lib/queue";
import { LOCAL_DEMO_DIR, storeDemoFile } from "@/lib/storage/demo-store";
import { getProPoolUserId, labelFromFileName, sanitizeLabel } from "@/lib/norms/pro-pool";

const MAX_FILE_SIZE = 700 * 1024 * 1024;

/**
 * POST /api/admin/pro — multipart: file (.dem), optional label. Adds a pro
 * demo to the pro pool: parsed like any upload, its players feed the pro norms.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".dem")) {
    return NextResponse.json({ error: "Only .dem files are accepted" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File too large (max 700MB)" }, { status: 400 });

  const rawLabel = form.get("label");
  const proLabel = sanitizeLabel(typeof rawLabel === "string" ? rawLabel : null) ?? labelFromFileName(file.name);
  const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
  // The same demo twice would count its players twice in the pro norms.
  const duplicate = await prisma.demoUpload.findFirst({
    where: { pro: true, deletedAt: null, fileName, fileSize: file.size, status: { not: "FAILED" } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "This demo is already in the pro pool" }, { status: 409 });
  const userId = await getProPoolUserId(prisma);
  const upload = await prisma.demoUpload.create({
    data: {
      userId,
      fileName,
      fileSize: file.size,
      fileUrl: "",
      status: "QUEUED",
      pro: true,
      proLabel,
    },
  });

  const filePath = join(LOCAL_DEMO_DIR, `${upload.id}.dem`);
  let fileUrl: string;
  try {
    await mkdir(LOCAL_DEMO_DIR, { recursive: true });
    await writeFile(filePath, new Uint8Array(await file.arrayBuffer()));
    fileUrl = await storeDemoFile(upload.id, filePath);
  } catch (err) {
    await unlink(filePath).catch(() => {});
    await prisma.demoUpload.update({
      where: { id: upload.id },
      data: { status: "FAILED", error: `Storing the demo failed: ${err instanceof Error ? err.message : String(err)}` },
    });
    return NextResponse.json({ error: "Failed to store the demo" }, { status: 500 });
  }
  await prisma.demoUpload.update({ where: { id: upload.id }, data: { fileUrl } });
  await demoParseQueue.add("parse", { uploadId: upload.id, filePath: fileUrl, userId });
  console.log(`[admin] pro demo uploadId=${upload.id} label="${proLabel}" by=${admin.id}`);
  return NextResponse.json({ uploadId: upload.id, label: proLabel });
}
