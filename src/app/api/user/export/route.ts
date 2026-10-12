import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { buildAccountExport } from "@/lib/account/export";
import { rateLimit } from "@/lib/security/rate-limit-http";

/** GET /api/user/export — all of the user's data as a JSON download (src/lib/account/export.ts). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("account", `export:${session.user.id}`);
  if (limited) return limited;

  const data = await buildAccountExport(prisma, session.user.id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cs2-analyst-dane-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
