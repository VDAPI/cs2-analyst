import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { deleteAnalysis } from "@/lib/library";
import { refreshNorms } from "@/lib/norms/persist";

/** DELETE /api/admin/pro/[id] — take a demo out of the pro pool; the pro norms are rebuilt without it. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const upload = await prisma.demoUpload.findUnique({ where: { id }, select: { pro: true, deletedAt: true } });
  if (!upload || !upload.pro || upload.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteAnalysis(prisma, id);
  const cells = await refreshNorms(prisma);
  console.log(`[admin] pro demo removed uploadId=${id} by=${admin.id}; norms cells=${cells}`);
  return NextResponse.json({ ok: true, cells });
}
