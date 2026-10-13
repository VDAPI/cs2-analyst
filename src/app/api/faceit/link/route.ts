import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";
import { FACEIT_RETURN_COOKIE, faceitRedirectUri, isFaceitLinkConfigured } from "@/lib/faceit/oauth";
import { requestOrigin } from "@/lib/request-origin";

const FACEIT_AUTH_URL = "https://accounts.faceit.com";

export async function GET(req: NextRequest) {
  console.log("=== FACEIT LINK START ===");
  const session = await getServerSession(authOptions);
  // The address the popup was opened from (S20: localhost, a Wi-Fi IP or
  // the https port); every redirect of the flow goes back there.
  const origin = requestOrigin(req.headers, req.url);

  if (!session?.user?.id) {
    console.log("[FACEIT Link] No session, redirecting to login");
    return NextResponse.redirect(new URL("/login", origin));
  }

  if (!isFaceitLinkConfigured()) {
    console.error("[FACEIT Link] FACEIT_CLIENT_ID / FACEIT_CLIENT_SECRET are not set");
    return NextResponse.redirect(new URL("/settings?error=faceit-not-configured", origin));
  }

  console.log("[FACEIT Link] Starting OAuth flow for user:", session.user.id);

  // Generate PKCE code_verifier and code_challenge
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  // Generate state with userId embedded
  const state = Buffer.from(
    JSON.stringify({ userId: session.user.id, nonce: crypto.randomBytes(16).toString("hex") })
  ).toString("base64url");

  // Store code_verifier and state in cookies
  const cookieStore = await cookies();
  // Secure only when the flow starts on https: a Secure cookie set from
  // http://localhost:3000 is dropped by Safari, and FACEIT returns to the
  // https port of the same host, where a plain cookie is still sent.
  const cookieOptions = {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    maxAge: 300,
    path: "/",
    sameSite: "lax" as const,
  };

  cookieStore.set("faceit-pkce-verifier", codeVerifier, cookieOptions);
  cookieStore.set("faceit-oauth-state", state, cookieOptions);
  cookieStore.set(FACEIT_RETURN_COOKIE, origin, cookieOptions);

  // Build FACEIT authorization URL
  const authUrl = new URL(FACEIT_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", process.env.FACEIT_CLIENT_ID as string);
  authUrl.searchParams.set("redirect_uri", faceitRedirectUri());
  authUrl.searchParams.set("scope", "openid email profile membership");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("[FACEIT Link] Redirecting to FACEIT");
  console.log("[FACEIT Link] redirect_uri:", faceitRedirectUri());

  return NextResponse.redirect(authUrl.toString());
}
