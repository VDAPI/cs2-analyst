import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatCard, buttonVariants } from "@/components/ui";
import { ListOrdered } from "lucide-react";
import { formatLimit, getPlanUsage } from "@/lib/limits";
import { demoState } from "@/lib/library";
import { isR2Enabled, demoRetention } from "@/lib/storage/demo-store";
import { LibraryList, type LibraryEntry } from "./library-list";

export default async function LibraryPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const steamId = session?.user?.steamId;

  const uploads = userId
    ? await prisma.demoUpload.findMany({
        where: { userId, kind: "PLAYER", deletedAt: null, status: "COMPLETED", matchId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          source: true,
          fileName: true,
          fileSize: true,
          keepDemo: true,
          demoDeletedAt: true,
          status: true,
          createdAt: true,
          match: {
            select: {
              id: true,
              map: true,
              date: true,
              scoreCT: true,
              scoreT: true,
              players: { select: { steamId: true, team: true, hltvRating: true } },
              _count: { select: { rounds: true } },
              rounds: { where: { ticks: null }, select: { id: true }, take: 1 },
            },
          },
        },
      })
    : [];
  const usage = userId ? await getPlanUsage(userId) : null;

  const entries: LibraryEntry[] = uploads.flatMap((u) => {
    const m = u.match;
    if (!m) return [];
    const me = steamId ? m.players.find((p) => p.steamId === steamId) : undefined;
    let result: LibraryEntry["result"] = null;
    if (me) {
      const mine = me.team === "CT" ? m.scoreCT : m.scoreT;
      const theirs = me.team === "CT" ? m.scoreT : m.scoreCT;
      result = mine > theirs ? "W" : mine < theirs ? "L" : "D";
    }
    return [
      {
        uploadId: u.id,
        matchId: m.id,
        map: m.map,
        date: m.date.toISOString(),
        analyzedAt: u.createdAt.toISOString(),
        scoreCT: m.scoreCT,
        scoreT: m.scoreT,
        result,
        rating: me?.hltvRating ?? null,
        source: u.source,
        fileName: u.fileName,
        fileSize: u.fileSize,
        demo: demoState(u),
        replayStored: m._count.rounds > 0 && m.rounds.length === 0,
      },
    ];
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analiza"
        title="Biblioteka analiz"
        description={
          <>
            Twoje zapisane raporty. Pliki demo są usuwane po analizie
            {demoRetention() === "keep" ? " (wyłączone na tym serwerze)" : ""}; raport i powtórka
            2D zostają. Zaznacz &quot;Zachowaj demo&quot;, by zatrzymać plik
            {isR2Enabled() ? " (przechowywany w Cloudflare R2)" : ""}.
          </>
        }
        actions={
          <Link href="/queue" className={buttonVariants({ variant: "secondary" })}>
            <ListOrdered className="h-4 w-4" aria-hidden />
            Kolejka analiz
          </Link>
        }
      />

      {usage && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <StatCard label="Zapisane analizy" value={entries.length} />
          <StatCard
            label="W tym miesiącu"
            value={`${usage.used}/${formatLimit(usage.limit)}`}
          />
          <StatCard
            label="Zachowane dema"
            value={`${usage.keptDemos}/${formatLimit(usage.limits.keptDemos)}`}
          />
        </div>
      )}

      <LibraryList entries={entries} />
    </div>
  );
}
