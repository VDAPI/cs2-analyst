import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { folderChain, MAX_FOLDER_DEPTH, userFolders } from "@/lib/team/folders";

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  parentId: z.string().min(1).max(40).nullable().optional(),
  /** Save a detected team as a folder: its roster. */
  steamIds: z.array(z.string().regex(/^\d{5,20}$/)).max(10).optional(),
});

/** Folders a player may own; stops a script from creating thousands. */
const MAX_FOLDERS = 300;

/** POST /api/team-folders — a team analysis folder, optionally inside another. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, parentId = null, steamIds = [] } = parsed.data;

  const rows = await userFolders(prisma, userId);
  if (rows.length >= MAX_FOLDERS) return NextResponse.json({ error: "Too many folders" }, { status: 409 });
  if (parentId) {
    if (!rows.some((r) => r.id === parentId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (folderChain(rows, parentId).length >= MAX_FOLDER_DEPTH) {
      return NextResponse.json({ error: "Folder too deep" }, { status: 409 });
    }
  }
  const folder = await prisma.teamFolder.create({ data: { userId, name, parentId, steamIds }, select: { id: true } });
  return NextResponse.json({ id: folder.id }, { status: 201 });
}
