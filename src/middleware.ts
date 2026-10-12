import { NextResponse, type NextRequest } from "next/server";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { bodyLimitFor } from "@/lib/security/body-limit";

// getToken (inside withAuth) derives the session cookie name from NEXTAUTH_URL:
// on https it defaults to "__Secure-next-auth.session-token". But auth.ts
// overrides the dev cookies to the unprefixed "next-auth.session-token"
// (secure: false for the self-signed dev cert). Without matching the name here,
// the middleware reads a cookie that was never set, treats every request as
// unauthenticated, and bounces back to /login — the login redirect loop.
const pageAuth = withAuth({
  cookies:
    process.env.NODE_ENV === "development"
      ? { sessionToken: { name: "next-auth.session-token" } }
      : undefined,
});

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default function middleware(req: NextRequest, event: Parameters<typeof pageAuth>[1]) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    // Route handlers read JSON bodies whole and have no size limit of their
    // own (S29): refuse oversize or unsized bodies before they are read.
    if (BODY_METHODS.has(req.method)) {
      const limit = bodyLimitFor(req.nextUrl.pathname);
      const length = req.headers.get("content-length");
      if (length === null) {
        if (req.headers.has("transfer-encoding")) {
          return NextResponse.json({ error: "Missing Content-Length" }, { status: 411 });
        }
      } else if (!(Number(length) <= limit)) {
        return NextResponse.json({ error: "Request body too large" }, { status: 413 });
      }
    }
    return NextResponse.next();
  }
  return pageAuth(req as NextRequestWithAuth, event);
}

export const config = {
  matcher: [
    // Not the two demo upload routes: middleware tees the request body, and
    // a 700 MB stream must reach the route handler untouched.
    "/api/((?!uploads/?$|admin/pro/?$).*)",
    "/matches/:path*",
    "/upload/:path*",
    "/queue/:path*",
    "/library/:path*",
    "/players/:path*",
    "/heatmaps/:path*",
    "/economy/:path*",
    "/grenades/:path*",
    "/mechanics/:path*",
    "/replay/:path*",
    "/compare/:path*",
    "/settings/:path*",
    "/premier/:path*",
    "/admin/:path*",
    "/progress/:path*",
    "/report/:path*",
    "/scouting/:path*",
    "/lineups/:path*",
    "/training/:path*",
    "/pro/:path*",
    "/coach/:path*",
  ],
};
