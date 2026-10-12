import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "@/lib/email";

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
        const email = normalizeEmail(credentials.email);

        // Dev bypass
        if (process.env.NODE_ENV === "development" && email === DEV_EMAIL) {
          let user = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
          if (!user) {
            const hash = await bcrypt.hash(DEV_PASSWORD, 12);
            user = await prisma.user.create({
              data: { email: DEV_EMAIL, name: "Dev User", password: hash },
            });
          }
          return { id: user.id, name: user.name, email: user.email };
        }

        // Emails are stored normalized; accounts registered before that keep
        // their original spelling, so fall back to the address as typed.
        const typed = credentials.email.trim();
        const user =
          (await prisma.user.findUnique({ where: { email } })) ??
          (typed !== email ? await prisma.user.findUnique({ where: { email: typed } }) : null);
        if (!user?.password) return null;

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;

        // No `image`: NextAuth copies it into the JWT as `picture`, and a
        // data-URI avatar would blow the session cookie past header limits.
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    // FACEIT is handled via manual OAuth flow in /api/auth/link-faceit
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user, trigger, account }) {
      // "signUp" is the first sign-in of a user the adapter just created (Steam login).
      if ((trigger === "signIn" || trigger === "signUp") && user) {
        token.id = user.id;
        // "Sign in with Steam" creates or finds the user through the adapter,
        // which never fills User.steamId; set it from the Steam account so
        // Premier history, replay and "my player" work for Steam logins.
        if (account?.provider === "steam" && account.providerAccountId) {
          await prisma.user
            .updateMany({
              where: { id: user.id, steamId: null },
              data: { steamId: account.providerAccountId },
            })
            // steamId is unique: another user already holds it (old link), keep theirs.
            .catch((err) => console.error("[auth] could not set steamId on Steam sign-in", err));
        }
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
          select: { steamId: true, faceitId: true, faceitNickname: true, plan: true, name: true },
        });
        if (dbUser) {
          token.steamId = dbUser.steamId;
          token.faceitId = dbUser.faceitId;
          token.faceitNickname = dbUser.faceitNickname;
          token.plan = dbUser.plan;
          token.name = dbUser.name;
        }
      }

      // The avatar is read from the DB in session(); never carry it in the
      // cookie (also strips it from tokens issued before this fix).
      delete token.picture;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.steamId = (token.steamId as string) ?? null;
        session.user.faceitId = (token.faceitId as string) ?? null;
        session.user.faceitNickname = (token.faceitNickname as string) ?? null;
        session.user.plan = token.plan as "FREE" | "PRO" | "TEAM";
        // Resolve the avatar from the DB, not the JWT — base64 data-URI avatars
        // would bloat the session cookie past 4096 bytes (CHUNKING_SESSION_COOKIE).
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { image: true },
        });
        session.user.image = dbUser?.image ?? null;
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
