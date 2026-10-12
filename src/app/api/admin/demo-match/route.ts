import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminUser } from "@/lib/admin/session";
import { isMatchId, setDemoMatchId } from "@/lib/demo/demo-match";

/**
 * POST /api/admin/demo-match — pick the match /demo shows to everyone (S21);
 * `matchId: null` goes back to the newest pro demo.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { matchId?: unknown };
  const matchId = body.matchId === null ? null : isMatchId(body.matchId) ? body.matchId : undefined;
  if (matchId === undefined) return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
  if (!(await setDemoMatchId(prisma, matchId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  console.log(`[admin] demo match ${matchId ?? "auto"} by=${admin.id}`);
  return NextResponse.json({ matchId });
}
