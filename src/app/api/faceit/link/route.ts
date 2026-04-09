import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";
import crypto from "crypto";

const FACEIT_AUTH_URL = "https://accounts.faceit.com";
const REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/faceit/link/callback`;

export async function GET() {
  console.log("=== FACEIT LINK START ===");
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    console.log("[FACEIT Link] No session, redirecting to login");
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
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
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
    sameSite: "lax" as const,
  };

  cookieStore.set("faceit-pkce-verifier", codeVerifier, cookieOptions);
  cookieStore.set("faceit-oauth-state", state, cookieOptions);

  // Build FACEIT authorization URL
  const authUrl = new URL(FACEIT_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", process.env.FACEIT_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", "openid email profile membership");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  console.log("[FACEIT Link] Redirecting to FACEIT");
  console.log("[FACEIT Link] redirect_uri:", REDIRECT_URI);

  return NextResponse.redirect(authUrl.toString());
}
