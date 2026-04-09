import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import Link from "next/link";
import { Play } from "lucide-react";

export default async function ReplayListPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const matches = userId
    ? await prisma.match.findMany({
        where: { upload: { userId } },
        select: {
          id: true,
          map: true,
          date: true,
          scoreCT: true,
          scoreT: true,
        },
        orderBy: { date: "desc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          2D Replay
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Select a match to watch the round-by-round replay.
        </p>
      </div>

      {matches.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-[var(--text-secondary)]">
              No matches to replay
            </p>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              Upload demos first to use the replay viewer.
            </p>
            <Link
              href="/upload"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-5 text-sm font-medium text-white transition-all hover:bg-[var(--accent-hover)]"
            >
              Upload Demo
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((match) => (
            <Link key={match.id} href={`/replay/${match.id}`}>
              <Card className="group relative overflow-hidden p-0 transition-all duration-150 hover:border-[var(--accent)]">
                <div className="relative h-32 w-full bg-cover bg-center" style={{
                  backgroundImage: `url(/maps/${match.map}_radar.png)`,
                  filter: "grayscale(40%) brightness(0.5)",
                }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(0,0,0,0.5)] transition-colors group-hover:bg-[var(--accent)]">
                      <Play className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <p className="font-medium text-[var(--text-primary)]">
                    {mapDisplayName(match.map)}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {match.date.toLocaleDateString()} — <span className="font-mono">{match.scoreCT}:{match.scoreT}</span>
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
