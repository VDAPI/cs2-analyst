import { NextResponse } from "next/server";
import type { NextFetchEvent } from "next/server";
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { bodyLimitFor } from "@/lib/security/body-limit";

// getToken (inside withAuth) needs the session cookie's name. NextAuth names
// it by the protocol of the address the user signed in on: on https
// "__Secure-next-auth.session-token", on http "next-auth.session-token".
// - In development auth.ts forces the unprefixed name (secure: false for the
//   self-signed dev cert); reading another name here would treat every
//   request as signed out and bounce back to /login (the login redirect loop).
// - The local Docker setup (S20) serves the same app on several addresses at
//   once (http://localhost:3000, http://<Wi-Fi IP>:3000 for a phone,
//   https://localhost:3443 for FACEIT linking), so a single name derived from
//   NEXTAUTH_URL would lock out the others: use the one the request carries.
const PLAIN = "next-auth.session-token";
const SECURE = "__Secure-next-auth.session-token";

const withPlainCookie = withAuth({ cookies: { sessionToken: { name: PLAIN } } });
const withSecureCookie = withAuth({ cookies: { sessionToken: { name: SECURE } } });

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default function middleware(req: NextRequestWithAuth, event: NextFetchEvent) {
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
  if (process.env.NODE_ENV === "development") return withPlainCookie(req, event);
  // Large sessions are split into SECURE.0, SECURE.1 … chunks.
  const secure = req.cookies.getAll().some((c) => c.name === SECURE || c.name.startsWith(`${SECURE}.`));
  return secure ? withSecureCookie(req, event) : withPlainCookie(req, event);
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
    "/team/:path*",
    "/play-like-pro/:path*",
    "/billing/:path*",
    "/faceit/:path*",
  ],
};
