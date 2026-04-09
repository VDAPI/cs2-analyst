import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const cookieStore = await cookies();
  cookieStore.set("faceit-link-intent", session.user.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 300,
    path: "/",
    sameSite: "lax",
  });

  // Redirect to NextAuth FACEIT sign-in flow
  const faceitSignInUrl = new URL("/api/auth/signin/faceit", process.env.NEXTAUTH_URL);
  faceitSignInUrl.searchParams.set("callbackUrl", "/settings");
  return NextResponse.redirect(faceitSignInUrl);
}
