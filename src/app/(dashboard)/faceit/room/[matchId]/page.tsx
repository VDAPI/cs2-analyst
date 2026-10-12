import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ExternalLink, Upload } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { parseRoomInput } from "@/lib/scouting/analysis";
import { importFaceitMatch } from "@/lib/faceit/sync";
import { hitRateLimit } from "@/lib/security/rate-limit";
import { EmptyState, PageHeader, buttonVariants } from "@/components/ui";

/**
 * /faceit/room/<FACEIT match id> — where the browser extension's "Analyze in
 * CS2 Analyst" button on a FACEIT match room lands (S26). Same address shape
 * as FACEIT's own room links. Never starts a download:
 * - already analysed → the report;
 * - in the player's FACEIT history (or fetched into it now, when they played
 *   in it) → the match list with that match selected in the FACEIT picker;
 * - otherwise → why, with upload and FACEIT links.
 */
export default async function FaceitRoomPage({ params }: { params: Promise<{ matchId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { t } = await getT();
  const { matchId: raw } = await params;
  const faceitMatchId = parseRoomInput(decodeURIComponent(raw));

  if (faceitMatchId) {
    const analysed = await prisma.demoUpload.findFirst({
      where: { userId, faceitMatchId, deletedAt: null, status: "COMPLETED", matchId: { not: null } },
      select: { matchId: true },
    });
    if (analysed?.matchId) redirect(`/report/${analysed.matchId}`);

    let pickId =
      (
        await prisma.faceitMatch.findUnique({
          where: { userId_faceitMatchId: { userId, faceitMatchId } },
          select: { id: true },
        })
      )?.id ?? null;
    if (!pickId && (await hitRateLimit("sync", userId)).allowed) {
      try {
        pickId = await importFaceitMatch(userId, faceitMatchId);
      } catch (err) {
        console.warn(`[faceit-room] import failed ${faceitMatchId}`, err instanceof Error ? err.message : err);
      }
    }
    if (pickId) redirect(`/matches?select=${encodeURIComponent(pickId)}#faceit-history`);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { faceitId: true } });
  const roomUrl = faceitMatchId ? `https://www.faceit.com/pl/cs2/room/${faceitMatchId}` : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="FACEIT" title={t("faceitRoom.title")} />
      <EmptyState
        title={faceitMatchId ? t("faceitRoom.notInHistory") : t("faceitRoom.invalid")}
        description={
          faceitMatchId
            ? `${t("faceitRoom.notInHistoryBody")}${user?.faceitId ? "" : ` ${t("faceitRoom.linkFaceit")}`}`
            : undefined
        }
        action={
          <>
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              <Upload className="h-4 w-4" aria-hidden /> {t("faceitRoom.upload")}
            </Link>
            {!user?.faceitId && (
              <Link href="/settings" className={buttonVariants({ variant: "secondary" })}>
                {t("faceitRoom.connect")}
              </Link>
            )}
            {roomUrl && (
              <a href={roomUrl} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "ghost" })}>
                <ExternalLink className="h-4 w-4" aria-hidden /> {t("faceitRoom.openRoom")}
              </a>
            )}
            <Link href="/matches" className={buttonVariants({ variant: "ghost" })}>
              {t("faceitRoom.matches")}
            </Link>
          </>
        }
      />
    </div>
  );
}
