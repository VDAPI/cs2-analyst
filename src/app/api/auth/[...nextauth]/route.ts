import NextAuth, { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import Steam from "next-auth-steam";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

const DEV_EMAIL = "dev@cs2analyst.local";
const DEV_PASSWORD = "dev";

function getAuthOptions(req: NextRequest): AuthOptions {
  return {
    adapter: PrismaAdapter(prisma),
    providers: [
      CredentialsProvider({
        name: "Credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;

          // Dev bypass
          if (process.env.NODE_ENV === "development" && credentials.email === DEV_EMAIL) {
            let user = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
            if (!user) {
              const hash = await bcrypt.hash(DEV_PASSWORD, 12);
              user = await prisma.user.create({
                data: { email: DEV_EMAIL, name: "Dev User", password: hash },
              });
            }
            return { id: user.id, name: user.name, email: user.email, image: user.image };
          }

          const user = await prisma.user.findUnique({ where: { email: credentials.email } });
          if (!user?.password) return null;

          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) return null;

          return { id: user.id, name: user.name, email: user.email, image: user.image };
        },
      }),
      Steam(req, {
        clientSecret: process.env.STEAM_API_KEY!,
      }),
    ],
    session: { strategy: "jwt" },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider !== "steam") return true;

        // Check for Steam linking flow
        const cookieStore = await cookies();
        const linkIntent = cookieStore.get("steam-link-intent");

        if (linkIntent) {
          const existingUserId = linkIntent.value;
          const steamId = (profile as { steamid?: string })?.steamid ?? null;

          // Check if this Steam account is already linked to another user
          if (steamId) {
            const existing = await prisma.user.findUnique({ where: { steamId } });
            if (existing && existing.id !== existingUserId) {
              cookieStore.delete("steam-link-intent");
              return "/settings?error=steam-already-linked";
            }
          }

          // Link Steam to existing user
          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            update: {},
            create: {
              userId: existingUserId,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token,
              token_type: account.token_type,
              scope: account.scope,
            },
          });

          if (steamId) {
            await prisma.user.update({
              where: { id: existingUserId },
              data: {
                steamId,
                image: (profile as { avatarfull?: string })?.avatarfull ?? undefined,
              },
            });
          }

          cookieStore.delete("steam-link-intent");
          return "/settings?linked=steam";
        }

        return true;
      },
      async jwt({ token, user, trigger }) {
        if (trigger === "signIn" && user) {
          token.id = user.id;
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { steamId: true, plan: true },
          });
          if (dbUser) {
            token.steamId = dbUser.steamId;
            token.plan = dbUser.plan;
          }
        }

        // Allow manual refresh (e.g. after linking Steam)
        if (trigger === "update") {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { steamId: true, plan: true, name: true, image: true },
          });
          if (dbUser) {
            token.steamId = dbUser.steamId;
            token.plan = dbUser.plan;
            token.name = dbUser.name;
            token.picture = dbUser.image;
          }
        }

        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.id as string;
          session.user.steamId = (token.steamId as string) ?? null;
          session.user.plan = token.plan as "FREE" | "PRO" | "TEAM";
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
    },
  };
}

async function handler(
  req: NextRequest,
  ctx: { params: { nextauth: string[] } }
) {
  return NextAuth(req, ctx, getAuthOptions(req));
}

export { handler as GET, handler as POST };
