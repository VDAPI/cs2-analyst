import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { getPlanUsage } from "@/lib/limits";
import { suggestSlug } from "@/lib/sharing/share";
import { slugSuffix } from "@/lib/sharing/token";
import { SettingsContent } from "./settings-content";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      plan: true,
      steamId: true,
      faceitId: true,
      faceitNickname: true,
      steamAuthCode: true,
      publicProfile: true,
      publicSlug: true,
    },
  });

  if (!dbUser) {
    redirect("/login");
  }

  const [usage, shares] = await Promise.all([
    getPlanUsage(session.user.id),
    prisma.share.findMany({
      where: { userId: session.user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, token: true, kind: true, roundNumber: true, views: true, createdAt: true, match: { select: { map: true } } },
    }),
  ]);

  return (
    <Suspense>
      <SettingsContent
        user={{
          name: dbUser.name,
          email: dbUser.email,
          image: dbUser.image,
          plan: dbUser.plan,
          steamId: dbUser.steamId,
          faceitId: dbUser.faceitId,
          faceitNickname: dbUser.faceitNickname,
        }}
        premierHistory={Boolean(dbUser.steamAuthCode)}
        publicProfile={{
          enabled: dbUser.publicProfile,
          slug: dbUser.publicSlug ?? suggestSlug(dbUser.name ?? dbUser.faceitNickname, slugSuffix()),
        }}
        shares={shares.map((s) => ({
          id: s.id,
          token: s.token,
          kind: s.kind,
          map: s.match.map,
          round: s.roundNumber,
          views: s.views,
          createdAt: s.createdAt.toISOString(),
        }))}
        usage={{
          used: usage.used,
          monthlyLimit: Number.isFinite(usage.limit) ? usage.limit : null,
          keptDemos: usage.keptDemos,
          keptLimit: Number.isFinite(usage.limits.keptDemos) ? usage.limits.keptDemos : null,
          batchSize: usage.limits.batchSize,
          uploadFiles: usage.limits.uploadFiles,
        }}
      />
    </Suspense>
  );
}
