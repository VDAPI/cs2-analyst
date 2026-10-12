import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";

const patchSchema = z
  .object({
    plan: z.enum(["FREE", "PRO", "TEAM"]).optional(),
    role: z.enum(["USER", "ADMIN"]).optional(),
    /** Per-user monthly demo limit; null goes back to the plan default. */
    monthlyDemoLimit: z.number().int().min(0).max(100_000).nullable().optional(),
  })
  .strict();

/** PATCH /api/admin/users/[id] — change a player's plan, role or monthly limit. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const data = parsed.data;
  if (id === admin.id && data.role === "USER") {
    return NextResponse.json({ error: "Nie możesz odebrać admina samemu sobie" }, { status: 409 });
  }

  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, plan: true, role: true, monthlyDemoLimit: true },
  });
  console.log(`[admin] user=${id} updated by=${admin.id}: ${JSON.stringify(data)}`);
  return NextResponse.json({ user });
}
