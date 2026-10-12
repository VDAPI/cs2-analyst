import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import type { NextFetchEvent } from "next/server";

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

export default function middleware(req: NextRequestWithAuth, event: NextFetchEvent) {
  if (process.env.NODE_ENV === "development") return withPlainCookie(req, event);
  // Large sessions are split into SECURE.0, SECURE.1 … chunks.
  const secure = req.cookies.getAll().some((c) => c.name === SECURE || c.name.startsWith(`${SECURE}.`));
  return secure ? withSecureCookie(req, event) : withPlainCookie(req, event);
}

export const config = {
  matcher: [
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
  ],
};
