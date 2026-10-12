import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getPlanUsage } from "@/lib/limits";
import { deleteAnalysis, replayDataComplete } from "@/lib/library";
import { deleteUploadDemo } from "@/lib/storage/demo-store";

async function ownUpload(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const upload = await prisma.demoUpload.findUnique({ where: { id } });
  if (!upload || upload.userId !== session.user.id || upload.deletedAt) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { upload, userId: session.user.id };
}

const patchSchema = z.object({
  keepDemo: z.boolean().optional(),
  deleteDemo: z.literal(true).optional(),
});

/**
 * PATCH /api/uploads/[id] — { keepDemo } toggles "keep demo";
 * { deleteDemo: true } deletes the .dem now and keeps the analysis.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownUpload(id);
  if (own.error) return own.error;
  const { upload, userId } = own;

  const body = patchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (body.data.keepDemo === true) {
    if (upload.demoDeletedAt) {
      return NextResponse.json(
        { error: "The demo was already deleted after the analysis. Upload it again to keep it." },
        { status: 409 }
      );
    }
    const usage = await getPlanUsage(userId);
    if (!upload.keepDemo && usage.keptDemos >= usage.limits.keptDemos) {
      return NextResponse.json(
        { error: `You can keep up to ${usage.limits.keptDemos} demos on the ${usage.plan} plan.` },
        { status: 403 }
      );
    }
    await prisma.demoUpload.update({ where: { id }, data: { keepDemo: true } });
    return NextResponse.json({ keepDemo: true, demoDeleted: false });
  }

  const deleteNow = body.data.deleteDemo === true || body.data.keepDemo === false;
  if (upload.keepDemo) {
    await prisma.demoUpload.update({ where: { id }, data: { keepDemo: false } });
  }
  // A finished analysis whose demo is no longer kept loses the file now, as
  // long as the replay data is safely in the DB. Unfinished ones lose it
  // when the worker is done with them.
  let demoDeleted = Boolean(upload.demoDeletedAt);
  if (deleteNow && !demoDeleted && upload.status === "COMPLETED" && upload.matchId) {
    if (await replayDataComplete(prisma, upload.matchId)) {
      await deleteUploadDemo(prisma, id);
      demoDeleted = true;
    } else if (body.data.deleteDemo) {
      return NextResponse.json(
        { error: "This match has no stored replay data yet; deleting the demo would break its 2D replay." },
        { status: 409 }
      );
    }
  }
  return NextResponse.json({ keepDemo: false, demoDeleted });
}

/**
 * DELETE /api/uploads/[id] — delete an analysis (match, report, replay data,
 * demo), or cancel a queued one. An upload still being worked on is marked
 * deleted and the worker cleans it up when it finishes.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownUpload(id);
  if (own.error) return own.error;
  const { upload } = own;

  if (upload.status === "COMPLETED" || upload.status === "FAILED") {
    await deleteAnalysis(prisma, id);
  } else {
    await prisma.demoUpload.update({
      where: { id },
      data: { deletedAt: new Date(), faceitMatchId: null },
    });
    await prisma.faceitMatch.updateMany({ where: { uploadId: id }, data: { uploadId: null } });
  }
  return NextResponse.json({ ok: true });
}
