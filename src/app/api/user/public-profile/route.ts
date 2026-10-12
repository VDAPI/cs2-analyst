import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isValidSlug, normalizeSlug, profilePath } from "@/lib/sharing/share";
import { rateLimit } from "@/lib/security/rate-limit-http";

const schema = z.object({ enabled: z.boolean(), slug: z.string().max(60) });

/** PATCH /api/user/public-profile — turn the /u/<slug> page on or off and set its address. */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimit("write", session.user.id);
  if (limited) return limited;

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const slug = normalizeSlug(body.data.slug);
  if (!isValidSlug(slug)) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { publicProfile: body.data.enabled, publicSlug: slug },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "taken" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ enabled: body.data.enabled, slug, path: profilePath(slug) });
}
