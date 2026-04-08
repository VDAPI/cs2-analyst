import NextAuth from "next-auth";
import Steam from "next-auth-steam";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

async function handler(
  req: NextRequest,
  ctx: { params: { nextauth: string[] } }
) {
  return NextAuth(req, ctx, {
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
        if (account?.provider !== "steam") return true;

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
      },
    },
  });
}

export { handler as GET, handler as POST };
