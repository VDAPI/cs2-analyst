import NextAuth, { getServerSession } from "next-auth";
import Steam from "next-auth-steam";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  const params = await ctx.params;
  const route = params.nextauth?.join("/");
  console.log(`[NextAuth] ${req.method} /api/auth/${route}`);

  return NextAuth(req, { params }, {
    ...authOptions,
    debug: process.env.NODE_ENV === "development",
    providers: [
      ...authOptions.providers,
      Steam(req, {
        clientSecret: process.env.STEAM_API_KEY!,
      }),
    ],
    callbacks: {
      ...authOptions.callbacks,
      async signIn({ user, account, profile }) {
        console.log(`[NextAuth] signIn callback — provider: ${account?.provider}, user: ${user?.id}`);
        if (account?.provider === "faceit") {
          console.log("[NextAuth] FACEIT profile:", JSON.stringify(profile, null, 2));
        }
        // ─── Steam Linking ─────────────────────────────────
        if (account?.provider === "steam") {
          const cookieStore = await cookies();
          const linkIntent = cookieStore.get("steam-link-intent");

          if (linkIntent) {
            cookieStore.delete("steam-link-intent");
            // The cookie only says "a link was started"; its value is not
            // trusted (anyone can set it to another user's id in their own
            // browser). Link to the signed-in user, and only when they are
            // the one who started it.
            const session = await getServerSession(authOptions);
            const sessionUserId = session?.user?.id;
            if (!sessionUserId) {
              // Stale intent (an abandoned link, then a fresh login): plain sign-in.
              return true;
            }
            if (sessionUserId !== linkIntent.value) {
              return "/settings?error=steam-link-failed";
            }
            const existingUserId = sessionUserId;
            const steamId = (profile as { steamid?: string })?.steamid ?? null;

            if (steamId) {
              const existing = await prisma.user.findUnique({ where: { steamId } });
              if (existing && existing.id !== existingUserId) {
                return "/settings?error=steam-already-linked";
              }
            }
            // The Steam account may already belong to another user (Steam login).
            const linkedAccount = await prisma.account.findUnique({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                },
              },
              select: { userId: true },
            });
            if (linkedAccount && linkedAccount.userId !== existingUserId) {
              return "/settings?error=steam-already-linked";
            }

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

            return "/settings?linked=steam";
          }

          return true;
        }

        // FACEIT linking handled via manual OAuth in /api/auth/link-faceit
        return true;
      },
    },
  });
}

export { handler as GET, handler as POST };
