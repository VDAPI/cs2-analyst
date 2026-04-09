import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncFaceitMatches } from "@/lib/faceit/sync";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.faceitId) {
    return NextResponse.json(
      { error: "No FACEIT account linked" },
      { status: 400 }
    );
  }

  try {
    const result = await syncFaceitMatches(session.user.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Sync failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
