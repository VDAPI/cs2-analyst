import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not logged in", session: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      steamId: true,
      faceitId: true,
      faceitNickname: true,
      lastFaceitSync: true,
      plan: true,
    },
  });

  return NextResponse.json({
    session: {
      id: session.user.id,
      faceitId: session.user.faceitId,
      faceitNickname: session.user.faceitNickname,
    },
    db: user,
  });
}
