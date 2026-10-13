import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/security/rate-limit-http";
import { ensureFriendCode, friendPath, newFriendCode } from "@/lib/friends/load";

const schema = z.object({ reset: z.boolean().optional() }).nullable();

/**
 * POST /api/friends/code — the player's friend invite link; `{ reset: true }`
 * replaces it, so the old link stops working.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("write", userId);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let code: string;
  if (body.data?.reset) {
    code = newFriendCode();
    await prisma.user.update({ where: { id: userId }, data: { friendCode: code } });
  } else {
    code = await ensureFriendCode(prisma, userId);
  }
  return NextResponse.json({ code, path: friendPath(code) });
}
