import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

/** DELETE /api/matches/[matchId]/notes/[noteId] — remove one of your map notes. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ matchId: string; noteId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { matchId, noteId } = await params;
  const { count } = await prisma.mapNote.deleteMany({ where: { id: noteId, matchId, userId: session.user.id } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
