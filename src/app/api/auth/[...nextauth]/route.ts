import NextAuth from "next-auth";
import Steam from "next-auth-steam";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

interface FaceitProfile {
  guid?: string;
  nickname?: string;
  avatar?: string;
  email?: string;
}

async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  return NextAuth(req, { params: await ctx.params }, {
    ...authOptions,
    providers: [
      ...authOptions.providers,
      Steam(req, {
        clientSecret: process.env.STEAM_API_KEY!,
      }),
    ],
    callbacks: {
      ...authOptions.callbacks,
      async signIn({ user, account, profile }) {
        // ─── Steam Linking ─────────────────────────────────
        if (account?.provider === "steam") {
          const cookieStore = await cookies();
          const linkIntent = cookieStore.get("steam-link-intent");

          if (linkIntent) {
            const existingUserId = linkIntent.value;
            const steamId = (profile as { steamid?: string })?.steamid ?? null;

            if (steamId) {
              const existing = await prisma.user.findUnique({ where: { steamId } });
              if (existing && existing.id !== existingUserId) {
                cookieStore.delete("steam-link-intent");
                return "/settings?error=steam-already-linked";
              }
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

            cookieStore.delete("steam-link-intent");
            return "/settings?linked=steam";
          }

          return true;
        }

        // ─── FACEIT Linking ────────────────────────────────
        if (account?.provider === "faceit") {
          const cookieStore = await cookies();
          const linkIntent = cookieStore.get("faceit-link-intent");

          if (linkIntent) {
            const existingUserId = linkIntent.value;
            const faceitProfile = profile as FaceitProfile;
            const faceitId = faceitProfile?.guid ?? null;
            const faceitNickname = faceitProfile?.nickname ?? null;

            if (faceitId) {
              const existing = await prisma.user.findUnique({ where: { faceitId } });
              if (existing && existing.id !== existingUserId) {
                cookieStore.delete("faceit-link-intent");
                return "/settings?error=faceit-already-linked";
              }
            }

            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider: account.provider,
                  providerAccountId: account.providerAccountId,
                },
              },
              update: {
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
              create: {
                userId: existingUserId,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token,
                refresh_token: account.refresh_token,
                expires_at: account.expires_at,
                token_type: account.token_type,
                scope: account.scope,
                id_token: account.id_token,
              },
            });

            if (faceitId) {
              await prisma.user.update({
                where: { id: existingUserId },
                data: {
                  faceitId,
                  faceitNickname,
                  image: faceitProfile?.avatar ?? undefined,
                },
              });
            }

            cookieStore.delete("faceit-link-intent");
            return "/settings?linked=faceit";
          }

          return true;
        }

        return true;
      },
    },
  });
}

export { handler as GET, handler as POST };
