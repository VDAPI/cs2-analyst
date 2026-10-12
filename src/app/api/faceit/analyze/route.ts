import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { allowedBatch, getPlanUsage, keepDemoSlotsLeft } from "@/lib/limits";
import {
  activeUploadId,
  enqueueFaceitDownload,
  faceitDownloadsEnabled,
  FACEIT_UPLOAD_INCLUDE,
} from "@/lib/faceit/analyze";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  keepDemo: z.boolean().optional(),
});

type Skipped = { id: string; reason: "not_found" | "already_analyzed" | "limit" };

/**
 * POST /api/faceit/analyze — "Analyze selected".
 *
 * Body: { ids: FaceitMatch.id[], keepDemo?: boolean }.
 * With the Downloads API: queues a download + analysis per match, up to what
 * the plan allows, and returns { mode: "queued", queued, skipped }.
 * Without it: returns { mode: "upload", uploadUrl } — the upload page lists
 * the picked matches with a link to each FACEIT match room.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const ids = [...new Set(parsed.data.ids)];

  const matches = await prisma.faceitMatch.findMany({
    where: { id: { in: ids }, userId },
    include: FACEIT_UPLOAD_INCLUDE,
    orderBy: { date: "desc" },
  });

  const skipped: Skipped[] = ids
    .filter((id) => !matches.some((m) => m.id === id))
    .map((id) => ({ id, reason: "not_found" }));
  const todo = matches.filter((m) => {
    if (activeUploadId(m)) {
      skipped.push({ id: m.id, reason: "already_analyzed" });
      return false;
    }
    return true;
  });

  if (!faceitDownloadsEnabled()) {
    const pick = todo.map((m) => m.id).join(",");
    return NextResponse.json({
      mode: "upload",
      uploadUrl: pick ? `/upload?faceit=${pick}` : "/upload",
      skipped,
    });
  }

  const usage = await getPlanUsage(userId);
  const n = allowedBatch(todo.length, usage.remaining, usage.limits.batchSize);
  // "Keep demo" only for as many as the plan's cap still allows.
  let keepSlots = parsed.data.keepDemo ? keepDemoSlotsLeft(usage) : 0;
  const queued: { id: string; uploadId: string }[] = [];
  for (const m of todo.slice(0, n)) {
    const keep = keepSlots > 0;
    if (keep) keepSlots--;
    const uploadId = await enqueueFaceitDownload(userId, m, keep);
    queued.push({ id: m.id, uploadId });
  }
  for (const m of todo.slice(n)) skipped.push({ id: m.id, reason: "limit" });

  return NextResponse.json({ mode: "queued", queued, skipped });
}
