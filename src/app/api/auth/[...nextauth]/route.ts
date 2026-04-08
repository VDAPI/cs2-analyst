import NextAuth from "next-auth";
import Steam from "next-auth-steam";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import type { NextRequest } from "next/server";

async function handler(
  req: NextRequest,
  ctx: { params: { nextauth: string[] } }
) {
  return NextAuth(req, ctx, {
    adapter: PrismaAdapter(prisma),
    providers: [
      Steam(req, {
        clientSecret: process.env.STEAM_API_KEY!,
      }),
    ],
    session: {
      strategy: "database",
    },
    callbacks: {
      async session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { steamId: true, plan: true },
          });
          if (dbUser) {
            session.user.steamId = dbUser.steamId;
            session.user.plan = dbUser.plan;
          }
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
    },
  });
}

export { handler as GET, handler as POST };
