import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { StatCard } from "@/components/ui";
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
        where: { userId, deletedAt: null, status: "COMPLETED", matchId: { not: null } },
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Analysis library</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Your saved reports. Demo files are deleted after analysis
            {demoRetention() === "keep" ? " (disabled on this server)" : ""}; the report and the
            2D replay stay. Mark &quot;Keep demo&quot; to hold on to a file
            {isR2Enabled() ? " (stored in Cloudflare R2)" : ""}.
          </p>
        </div>
        <Link
          href="/queue"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.06)] px-5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Analysis queue
        </Link>
      </div>

      {usage && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Saved analyses" value={entries.length} />
          <StatCard
            label="This month"
            value={`${usage.used}/${formatLimit(usage.limit)}`}
            accentColor="var(--ct-blue)"
          />
          <StatCard
            label="Kept demos"
            value={`${usage.keptDemos}/${formatLimit(usage.limits.keptDemos)}`}
            accentColor="var(--t-gold)"
          />
        </div>
      )}

      <LibraryList entries={entries} />
    </div>
  );
}
