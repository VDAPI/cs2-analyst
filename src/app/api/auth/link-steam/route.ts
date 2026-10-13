import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isSteamLoginEnabled } from "@/lib/auth";
import { cookies } from "next/headers";
import { requestOrigin } from "@/lib/request-origin";

/**
 * Marks "the next Steam sign-in links Steam to this account" (read by the
 * signIn callback in [...nextauth]). Settings then starts the Steam sign-in
 * itself with signIn("steam"): a plain GET to /api/auth/signin/steam would
 * only bounce to the login page (NextAuth v4 needs a POST with a CSRF token).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSteamLoginEnabled()) {
    return NextResponse.json({ error: "steam-not-configured" }, { status: 503 });
  }

  const cookieStore = await cookies();
  cookieStore.set("steam-link-intent", session.user.id, {
    httpOnly: true,
    // Secure only on https: the local Docker setup (S20) is plain http.
    secure: requestOrigin(req.headers, req.url).startsWith("https://"),
    maxAge: 300,
    path: "/",
    sameSite: "lax",
  });
  return NextResponse.json({ ok: true });
}
