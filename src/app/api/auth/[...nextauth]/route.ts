import NextAuth, { getServerSession } from "next-auth";
import Steam from "next-auth-steam";
import { authOptions, isSteamLoginEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { requestOrigin } from "@/lib/request-origin";

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
      // Steam is optional: without a key the provider throws on every auth request.
      // Steam OpenID returns to the address the sign-in started on, not to
      // NEXTAUTH_URL: the local Docker setup (S20) is also opened from a phone
      // at the computer's Wi-Fi IP, where "localhost" would be the phone.
      ...(isSteamLoginEnabled()
        ? [
            Steam(req, {
              clientSecret: process.env.STEAM_API_KEY as string,
              callbackUrl: `${requestOrigin(req.headers, req.url)}/api/auth/callback`,
            }),
          ]
        : []),
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

          await adoptSteamUser(account.providerAccountId);
          return true;
        }

        // FACEIT linking handled via manual OAuth in /api/auth/link-faceit
        return true;
      },
    },
  });
}

/**
 * Plain "Sign in with Steam": a user row can hold this Steam id without the
 * Account row the adapter looks up (steamId set by an older link flow, or a
 * Steam user whose Account row was lost). The adapter then matches that row
 * by the provider's pseudo email (`<steamid>@steamcommunity.com`) and stops
 * with OAuthAccountNotLinked, so the player lands back on /login. Attach the
 * Account to that user first; NextAuth looks the account up again after
 * signIn() and signs them in.
 */
async function adoptSteamUser(steamId: string) {
  const linked = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "steam", providerAccountId: steamId } },
    select: { id: true },
  });
  if (linked) return;
  const owner =
    (await prisma.user.findUnique({ where: { steamId }, select: { id: true } })) ??
    (await prisma.user.findUnique({ where: { email: `${steamId}@steamcommunity.com` }, select: { id: true } }));
  if (!owner) return; // first Steam login: the adapter creates the user
  await prisma.account.create({
    data: { userId: owner.id, type: "oauth", provider: "steam", providerAccountId: steamId },
  });
}

export { handler as GET, handler as POST };
