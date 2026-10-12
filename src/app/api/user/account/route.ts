import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { deleteAccount, isDeleteConfirmation } from "@/lib/account/delete";
import { rateLimit } from "@/lib/security/rate-limit-http";

const bodySchema = z.object({
  /** "USUŃ" / "DELETE", typed by the player. */
  confirm: z.string().max(20),
  /** Required when the account has a password. */
  password: z.string().max(200).optional(),
});

/**
 * DELETE /api/user/account — deletes the account and all its data
 * (src/lib/account/delete.ts). The client signs out afterwards.
 */
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const limited = await rateLimit("account", userId);
  if (limited) return limited;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success || !isDeleteConfirmation(body.data.confirm)) {
    return NextResponse.json({ error: "Type the confirmation word to delete the account" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.password) {
    const ok = body.data.password ? await bcrypt.compare(body.data.password, user.password) : false;
    if (!ok) return NextResponse.json({ error: "Wrong password", code: "wrong_password" }, { status: 403 });
  }

  const result = await deleteAccount(prisma, userId);
  console.log(
    `[account] deleted user=${userId} uploads=${result.uploads} matches=${result.matches} demoErrors=${result.demoErrors}`
  );
  return NextResponse.json({ ok: true });
}
