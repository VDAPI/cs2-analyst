import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { zoneFields } from "@/lib/team/zone-schema";

const createSchema = z.object({ map: z.string().regex(/^[a-z0-9_]{1,40}$/), ...zoneFields }).strict();

/** POST /api/admin/zones — a callout zone an admin drew on /callouts. */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const zone = await prisma.mapZone.create({ data: parsed.data, select: { id: true } });
  console.log(`[admin] zone ${parsed.data.map}/${parsed.data.name} created by=${admin.id}`);
  return NextResponse.json({ id: zone.id }, { status: 201 });
}
