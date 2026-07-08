import { withAuth } from "next-auth/middleware";

// getToken (inside withAuth) derives the session cookie name from NEXTAUTH_URL:
// on https it defaults to "__Secure-next-auth.session-token". But auth.ts
// overrides the dev cookies to the unprefixed "next-auth.session-token"
// (secure: false for the self-signed dev cert). Without matching the name here,
// the middleware reads a cookie that was never set, treats every request as
// unauthenticated, and bounces back to /login — the login redirect loop.
export default withAuth({
  cookies:
    process.env.NODE_ENV === "development"
      ? { sessionToken: { name: "next-auth.session-token" } }
      : undefined,
});

export const config = {
  matcher: [
    "/matches/:path*",
    "/upload/:path*",
    "/players/:path*",
    "/heatmaps/:path*",
    "/economy/:path*",
    "/grenades/:path*",
    "/replay/:path*",
    "/compare/:path*",
    "/settings/:path*",
  ],
};
