import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

/** POST /api/user/locale — switch PL/EN: cookie for the UI, User.locale for push. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { locale?: unknown };
  if (!isLocale(body.locale)) return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  const locale = body.locale;

  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
  }

  const res = NextResponse.json({ locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
