import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { placeKey } from "@/lib/team/map-lanes";

/** null = keep the built-in value, "" = none, text = the new value. */
const field = z.string().trim().max(40).nullable();
const bodySchema = z
  .object({
    map: z.string().regex(/^[a-z0-9_]{1,40}$/),
    place: z.string().min(1).max(60),
    name: field,
    ctSpot: field,
    laneA: field,
    laneB: field,
  })
  .strict();

/**
 * PUT /api/admin/callouts — an admin's correction of one demo callout on
 * /callouts: its display name, CT position and T lane per site. All fields
 * null removes the correction (back to the built-in table).
 */
export async function PUT(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { map, place, ...data } = parsed.data;
  const key = { map, place: placeKey(place) };

  if (Object.values(data).every((v) => v == null)) {
    await prisma.mapCallout.deleteMany({ where: key });
    return NextResponse.json({ ok: true, reset: true });
  }
  await prisma.mapCallout.upsert({
    where: { map_place: key },
    create: { ...key, ...data },
    update: data,
  });
  console.log(`[admin] callout ${map}/${key.place} updated by=${admin.id}: ${JSON.stringify(data)}`);
  return NextResponse.json({ ok: true });
}
