import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { zoneFields } from "@/lib/team/zone-schema";

const patchSchema = z.object(zoneFields).partial().strict();

/** PATCH /api/admin/zones/[id] — rename a zone, move its points or change its CT position / lanes. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const done = await prisma.mapZone.updateMany({ where: { id }, data: parsed.data });
  if (done.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/admin/zones/[id] — remove a drawn zone. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await prisma.mapZone.deleteMany({ where: { id } });
  console.log(`[admin] zone ${id} deleted by=${admin.id}`);
  return NextResponse.json({ ok: true });
}
