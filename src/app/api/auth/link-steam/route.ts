import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";

export async function GET() {
  const session = await getServerSession();

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const cookieStore = await cookies();
  cookieStore.set("steam-link-intent", session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
    sameSite: "lax",
  });

  // Redirect to NextAuth Steam sign-in flow
  const steamSignInUrl = new URL("/api/auth/signin/steam", process.env.NEXTAUTH_URL);
  steamSignInUrl.searchParams.set("callbackUrl", "/settings");
  return NextResponse.redirect(steamSignInUrl);
}
