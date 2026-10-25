import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { folderChain, MAX_FOLDER_DEPTH, subtreeIds, userFolders } from "@/lib/team/folders";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    parentId: z.string().min(1).max(40).nullable().optional(),
    /** The analysed team's roster (SteamID64s). */
    steamIds: z.array(z.string().regex(/^\d{5,20}$/)).max(10).optional(),
  })
  .strict();

async function own(id: string) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const rows = await userFolders(prisma, userId);
  if (!rows.some((r) => r.id === id)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { userId, rows };
}

/** PATCH /api/team-folders/[id] — rename, move under another folder, set the team roster. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await own(id);
  if (o.error) return o.error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { parentId } = parsed.data;
  if (parentId) {
    // Not into itself or below itself, and not deeper than the limit.
    if (subtreeIds(o.rows, id).includes(parentId) || !o.rows.some((r) => r.id === parentId)) {
      return NextResponse.json({ error: "Invalid parent" }, { status: 409 });
    }
    if (folderChain(o.rows, parentId).length >= MAX_FOLDER_DEPTH) {
      return NextResponse.json({ error: "Folder too deep" }, { status: 409 });
    }
  }
  await prisma.teamFolder.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/team-folders/[id] — remove the folder; its demos and
 * subfolders move up to its parent (nothing is deleted with it).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await own(id);
  if (o.error) return o.error;
  const parentId = o.rows.find((r) => r.id === id)!.parentId;
  await prisma.$transaction([
    prisma.demoUpload.updateMany({ where: { folderId: id }, data: { folderId: parentId } }),
    prisma.teamFolder.updateMany({ where: { parentId: id }, data: { parentId } }),
    prisma.teamFolder.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true, parentId });
}
