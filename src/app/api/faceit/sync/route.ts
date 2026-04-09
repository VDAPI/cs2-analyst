import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { syncFaceitMatches } from "@/lib/faceit/sync";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check DB directly — session JWT may be stale
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { faceitId: true },
  });

  if (!user?.faceitId) {
    return NextResponse.json(
      { error: "No FACEIT account linked" },
      { status: 400 }
    );
  }

  // Allow force=true to bypass throttle and re-scan 30 days
  let force = false;
  try {
    const body = await req.json();
    force = body.force === true;
  } catch {
    // No body or invalid JSON — that's fine, default to force=false
  }

  try {
    const result = await syncFaceitMatches(session.user.id, force);
    console.log("[FACEIT Sync Route] Result:", result);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[FACEIT Sync Route] Error:", err);
    return NextResponse.json(
      {
        error: "Sync failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
