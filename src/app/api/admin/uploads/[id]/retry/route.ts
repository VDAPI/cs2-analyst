import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { isStuck } from "@/lib/admin/metrics";
import { retryUpload } from "@/lib/retry";

/**
 * POST /api/admin/uploads/[id]/retry — run any player's failed (or stuck)
 * analysis again. Unlike the player's own retry it ignores the monthly limit.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  let upload = await prisma.demoUpload.findUnique({ where: { id } });
  if (!upload || upload.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (upload.status !== "FAILED") {
    if (!isStuck(upload)) {
      return NextResponse.json(
        { error: "Only failed or stuck analyses can be retried" },
        { status: 409 }
      );
    }
    // Close the stuck run first so a FACEIT re-download can take its match.
    upload = await prisma.demoUpload.update({
      where: { id },
      data: { status: "FAILED", error: "Zawieszona analiza, ponowiona z panelu admina" },
    });
  }

  const result = await retryUpload(upload, { enforceLimit: false });
  console.log(
    `[admin] retry uploadId=${id} by=${admin.id} -> ${result.ok ? result.uploadId : result.error}`
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ uploadId: result.uploadId });
}
