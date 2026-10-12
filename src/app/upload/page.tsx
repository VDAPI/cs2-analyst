import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getPlanUsage } from "@/lib/limits";
import { activeUploadId, FACEIT_UPLOAD_INCLUDE } from "@/lib/faceit/analyze";
import { activeSteamUploadId, STEAM_UPLOAD_INCLUDE } from "@/lib/steam/premier";
import { UploadClient, type FaceitSlot, type SteamSlot } from "./upload-client";

/**
 * Upload page. `?faceit=<id>,<id>` (from "Analyze selected" without the
 * Downloads API) lists those FACEIT matches, each with a link to its match
 * room and its own drop slot, so the uploaded demo is linked to the match.
 */
export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ faceit?: string; steam?: string; keep?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const { faceit, steam, keep } = await searchParams;

  const ids = (faceit ?? "").split(",").filter(Boolean).slice(0, 50);
  const faceitMatches =
    userId && ids.length > 0
      ? await prisma.faceitMatch.findMany({
          where: { id: { in: ids }, userId },
          include: FACEIT_UPLOAD_INCLUDE,
          orderBy: { date: "desc" },
        })
      : [];
  const slots: FaceitSlot[] = faceitMatches
    .filter((fm) => !activeUploadId(fm))
    .map((fm) => ({
      id: fm.id,
      map: fm.map,
      score: fm.score,
      date: fm.date.toISOString(),
      faceitUrl: fm.faceitUrl,
    }));

  const steamIds = (steam ?? "").split(",").filter(Boolean).slice(0, 50);
  const steamMatches =
    userId && steamIds.length > 0
      ? await prisma.steamMatch.findMany({
          where: { id: { in: steamIds }, userId },
          include: STEAM_UPLOAD_INCLUDE,
          orderBy: { createdAt: "desc" },
        })
      : [];
  const steamSlots: SteamSlot[] = steamMatches
    .filter((sm) => !activeSteamUploadId(sm))
    .map((sm) => ({ id: sm.id, shareCode: sm.shareCode }));

  const usage = userId ? await getPlanUsage(userId) : null;

  return (
    <UploadClient
      faceitSlots={slots}
      steamSlots={steamSlots}
      defaultKeepDemo={keep === "1"}
      maxFiles={Math.min(usage?.limits.uploadFiles ?? 5, usage?.remaining ?? 5)}
      remaining={usage?.remaining ?? 0}
      monthlyLimit={usage?.limit ?? 0}
    />
  );
}
