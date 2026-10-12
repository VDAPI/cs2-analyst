import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { backfillNormSamples, refreshNorms } from "@/lib/norms/persist";

/** POST /api/admin/norms/refresh — sample matches that have no norm samples yet, then rebuild every norm. */
export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sampled = await backfillNormSamples(prisma, { limit: 50 });
  const cells = await refreshNorms(prisma);
  return NextResponse.json({ sampled, cells });
}
