import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";

const DEV_EMAIL = "dev@cs2analyst.local";
const DEV_PASSWORD = "dev";

export const authOptions: AuthOptions = {
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
    // FACEIT is handled via manual OAuth flow in /api/auth/link-faceit
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (trigger === "signIn" && user) {
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { steamId: true, faceitId: true, faceitNickname: true, plan: true },
        });
        if (dbUser) {
          token.steamId = dbUser.steamId;
          token.faceitId = dbUser.faceitId;
          token.faceitNickname = dbUser.faceitNickname;
          token.plan = dbUser.plan;
        }
      }

      if (trigger === "update") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { steamId: true, faceitId: true, faceitNickname: true, plan: true, name: true, image: true },
        });
        if (dbUser) {
          token.steamId = dbUser.steamId;
          token.faceitId = dbUser.faceitId;
          token.faceitNickname = dbUser.faceitNickname;
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
        session.user.faceitId = (token.faceitId as string) ?? null;
        session.user.faceitNickname = (token.faceitNickname as string) ?? null;
        session.user.plan = token.plan as "FREE" | "PRO" | "TEAM";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  cookies:
    process.env.NODE_ENV === "development"
      ? {
          sessionToken: {
            name: "next-auth.session-token",
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: false,
            },
          },
          callbackUrl: {
            name: "next-auth.callback-url",
            options: {
              sameSite: "lax" as const,
              path: "/",
              secure: false,
            },
          },
          csrfToken: {
            name: "next-auth.csrf-token",
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: false,
            },
          },
          pkceCodeVerifier: {
            name: "next-auth.pkce.code_verifier",
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: false,
              maxAge: 60 * 15,
            },
          },
          state: {
            name: "next-auth.state",
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: false,
              maxAge: 60 * 15,
            },
          },
        }
      : undefined,
};
