import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { isReservedEmail } from "@/lib/norms/pro-pool";
import { isSteamPseudoEmail, normalizeEmail } from "@/lib/email";
import { clientIp } from "@/lib/security/rate-limit";
import { rateLimit } from "@/lib/security/rate-limit-http";

const registerSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  // Stored trimmed + lowercase, so "Admin@Site.com" can't sit next to "admin@site.com".
  email: z.string().trim().max(254).email().transform(normalizeEmail),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password must be at most 200 characters"),
});

export async function POST(req: Request) {
  const limited = await rateLimit("register", clientIp(req.headers));
  if (limited) return limited;

  const body: unknown = await req.json().catch(() => null);
  const result = registerSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0].message },
      { status: 400 }
    );
  }

  const { name, email, password } = result.data;
  // System addresses (dev login, the pro-pool owner) can never be registered,
  // nor Steam's pseudo addresses (<steamid>@steamcommunity.com): a password
  // account on one would block that player's "Sign in with Steam".
  if (isReservedEmail(email) || isSteamPseudoEmail(email)) {
    return NextResponse.json({ error: "This email address cannot be used" }, { status: 400 });
  }

  // Case-insensitive, so accounts stored before emails were normalized count too.
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword },
  });

  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
