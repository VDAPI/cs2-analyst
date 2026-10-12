import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui";
import { STEAM_UPLOAD_INCLUDE } from "@/lib/steam/premier";
import { PremierClient, type PremierRow } from "./premier-client";

/**
 * Premier / matchmaking (S18, opt-in): matches added by share code or found
 * by the Steam history sync. Nothing is downloaded until the player clicks.
 */
export default async function PremierPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { t } = await getT();

  const [user, matches] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { steamId: true, steamAuthCode: true, lastSteamSync: true },
    }),
    prisma.steamMatch.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: STEAM_UPLOAD_INCLUDE,
    }),
  ]);

  const rows: PremierRow[] = matches.map((m) => {
    const u = m.upload && !m.upload.deletedAt ? m.upload : null;
    return {
      id: m.id,
      shareCode: m.shareCode,
      hasReplayUrl: Boolean(m.demoUrl),
      createdAt: m.createdAt.toISOString(),
      state: !u
        ? "new"
        : u.status === "COMPLETED"
          ? "done"
          : u.status === "FAILED"
            ? "failed"
            : "queued",
      matchId: u?.status === "COMPLETED" ? u.matchId : null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("premier.eyebrow")}
        title={t("premier.title")}
        description={t("premier.description")}
      />
      <PremierClient
        rows={rows}
        steamLinked={Boolean(user?.steamId)}
        historyOn={Boolean(user?.steamAuthCode)}
        lastSync={user?.lastSteamSync?.toISOString() ?? null}
      />
    </div>
  );
}
