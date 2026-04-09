import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";

const TOKEN_URL = "https://api.faceit.com/auth/v1/oauth/token";
const USERINFO_URL = "https://api.faceit.com/auth/v1/resources/userinfo";
const REDIRECT_URI = `${process.env.NEXTAUTH_URL}/api/faceit/link/callback`;

interface FaceitUserInfo {
  guid: string;
  nickname: string;
  email: string;
  avatar: string;
  picture?: string;
  given_name?: string;
  locale?: string;
}

export async function GET(req: NextRequest) {
  console.log("=== FACEIT CALLBACK HIT ===", req.url);
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  console.log("[FACEIT Callback] Received:", { code: code ? "present" : "missing", state: state ? "present" : "missing", error });

  const settingsUrl = new URL("/settings", process.env.NEXTAUTH_URL);

  // Handle FACEIT errors
  if (error) {
    console.error("[FACEIT Callback] FACEIT returned error:", error);
    settingsUrl.searchParams.set("error", "faceit-denied");
    return NextResponse.redirect(settingsUrl.toString());
  }

  if (!code || !state) {
    console.error("[FACEIT Callback] Missing code or state");
    settingsUrl.searchParams.set("error", "faceit-link-failed");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Validate state and extract userId
  const cookieStore = await cookies();
  const storedState = cookieStore.get("faceit-oauth-state")?.value;
  const codeVerifier = cookieStore.get("faceit-pkce-verifier")?.value;

  console.log("[FACEIT Callback] Cookies:", {
    storedState: storedState ? "present" : "MISSING",
    codeVerifier: codeVerifier ? "present" : "MISSING",
    stateMatch: storedState === state,
  });

  if (!storedState || storedState !== state) {
    console.error("[FACEIT Callback] State mismatch — CSRF or cookie lost");
    settingsUrl.searchParams.set("error", "faceit-link-failed");
    return NextResponse.redirect(settingsUrl.toString());
  }

  if (!codeVerifier) {
    console.error("[FACEIT Callback] PKCE code_verifier cookie missing");
    settingsUrl.searchParams.set("error", "faceit-link-failed");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Parse userId from state
  let userId: string;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString());
    userId = parsed.userId;
    console.log("[FACEIT Callback] Extracted userId:", userId);
  } catch {
    console.error("[FACEIT Callback] Failed to parse state");
    settingsUrl.searchParams.set("error", "faceit-link-failed");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Exchange code for tokens
  console.log("[FACEIT Callback] Exchanging code for token...");
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  const basicAuth = Buffer.from(
    `${process.env.FACEIT_CLIENT_ID!}:${process.env.FACEIT_CLIENT_SECRET!}`
  ).toString("base64");

  let accessToken: string;
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenBody.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[FACEIT Callback] Token exchange failed:", tokenRes.status, errBody);
      settingsUrl.searchParams.set("error", "faceit-link-failed");
      return NextResponse.redirect(settingsUrl.toString());
    }

    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
    console.log("[FACEIT Callback] Token exchange OK");
  } catch (err) {
    console.error("[FACEIT Callback] Token exchange error:", err);
    settingsUrl.searchParams.set("error", "faceit-link-failed");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Fetch FACEIT user profile
  console.log("[FACEIT Callback] Fetching user info...");
  let faceitUser: FaceitUserInfo;
  try {
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      const errBody = await userRes.text();
      console.error("[FACEIT Callback] UserInfo failed:", userRes.status, errBody);
      settingsUrl.searchParams.set("error", "faceit-link-failed");
      return NextResponse.redirect(settingsUrl.toString());
    }

    faceitUser = await userRes.json();
    console.log("[FACEIT Callback] FACEIT user:", {
      guid: faceitUser.guid,
      nickname: faceitUser.nickname,
      email: faceitUser.email,
    });
  } catch (err) {
    console.error("[FACEIT Callback] UserInfo error:", err);
    settingsUrl.searchParams.set("error", "faceit-link-failed");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Check if this FACEIT account is already linked to a different user
  const faceitId = faceitUser.guid;
  const existing = await prisma.user.findUnique({ where: { faceitId } });
  if (existing && existing.id !== userId) {
    console.error("[FACEIT Callback] FACEIT ID already linked to user:", existing.id);
    settingsUrl.searchParams.set("error", "faceit-already-linked");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Update the user with FACEIT data
  console.log("[FACEIT Callback] Updating user", userId, "with faceitId:", faceitId);
  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        faceitId,
        faceitNickname: faceitUser.nickname,
      },
      select: { id: true, faceitId: true, faceitNickname: true },
    });
    console.log("[FACEIT Callback] DB update result:", updated);
  } catch (err) {
    console.error("[FACEIT Callback] DB update failed:", err);
    settingsUrl.searchParams.set("error", "faceit-link-failed");
    return NextResponse.redirect(settingsUrl.toString());
  }

  // Clean up cookies
  cookieStore.delete("faceit-oauth-state");
  cookieStore.delete("faceit-pkce-verifier");

  console.log("[FACEIT Callback] Linking complete!");

  // Return an HTML page that notifies the opener window and closes the popup
  const html = `<!DOCTYPE html>
<html><head><title>FACEIT Linked</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: "faceit-linked" }, window.location.origin);
    window.close();
  } else {
    window.location.href = "/settings?linked=faceit";
  }
</script>
<noscript><a href="/settings?linked=faceit">Return to settings</a></noscript>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
