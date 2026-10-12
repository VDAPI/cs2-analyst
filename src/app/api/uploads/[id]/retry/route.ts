import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { retryUpload } from "@/lib/retry";
import { rateLimit } from "@/lib/security/rate-limit-http";

/**
 * POST /api/uploads/[id]/retry — run a failed analysis again: re-parse the
 * stored demo, or re-download it from FACEIT. Returns { uploadId } (a new id
 * for a FACEIT re-download).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("analyze", session.user.id);
  if (limited) return limited;
  const userId = session.user.id;
  const { id } = await params;

  const upload = await prisma.demoUpload.findUnique({ where: { id } });
  if (!upload || upload.userId !== userId || upload.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (upload.status !== "FAILED") {
    return NextResponse.json({ error: "Only failed analyses can be retried" }, { status: 409 });
  }

  const result = await retryUpload(upload, { enforceLimit: true });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ uploadId: result.uploadId });
}
