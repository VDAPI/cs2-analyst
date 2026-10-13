import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";

const SESSION_COOKIES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

/**
 * The signed-in user's id, whichever session cookie the request carries.
 *
 * getServerSession only reads the cookie name that matches the request's
 * scheme ("__Secure-…" on https). The local Docker setup (S20) signs in on
 * http://localhost:3000 while FACEIT returns to https://localhost:3443:
 * cookies are per host, not per port, so the plain cookie does arrive there,
 * it is just under the other name (the middleware handles pages the same way).
 */
export async function sessionUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session.user.id;
  for (const name of SESSION_COOKIES) {
    const present = req.cookies.getAll().some((c) => c.name === name || c.name.startsWith(`${name}.`));
    if (!present) continue;
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName: name }).catch(() => null);
    if (typeof token?.id === "string") return token.id;
  }
  return null;
}
