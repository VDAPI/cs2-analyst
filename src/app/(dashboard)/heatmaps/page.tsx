import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { getMapConfig } from "@/lib/utils/maps";
import Link from "next/link";
import { Flame } from "lucide-react";

export default async function HeatmapsListPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  // Get all maps the user has matches on, with match count
  const matches = userId
    ? await prisma.match.findMany({
        where: { upload: { userId } },
        select: { id: true, map: true, date: true, scoreCT: true, scoreT: true },
        orderBy: { date: "desc" },
      })
    : [];

  // Group by map
  const mapGroups = new Map<string, { count: number; latestDate: Date; matchIds: string[] }>();
  for (const m of matches) {
    const existing = mapGroups.get(m.map);
    if (existing) {
      existing.count++;
      existing.matchIds.push(m.id);
      if (m.date > existing.latestDate) existing.latestDate = m.date;
    } else {
      mapGroups.set(m.map, { count: 1, latestDate: m.date, matchIds: [m.id] });
    }
  }

  const sortedMaps = Array.from(mapGroups.entries()).sort(
    (a, b) => b[1].count - a[1].count
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Heatmaps
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Visualize kill and death patterns across matches on each map.
        </p>
      </div>

      {sortedMaps.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-[var(--text-secondary)]">
              No matches to analyze
            </p>
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              Upload demos to generate heatmaps.
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
        <>
          {/* Map-centric grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortedMaps.map(([mapRaw, info]) => {
              const config = getMapConfig(mapRaw);
              return (
                <Link key={mapRaw} href={`/heatmaps/map/${mapRaw}`}>
                  <Card className="group relative overflow-hidden p-0 transition-all duration-150 hover:border-[var(--border-hover)] hover:shadow-[0_0_30px_rgba(239,68,68,0.06)]">
                    <div
                      className="h-36 w-full bg-cover bg-center"
                      style={{
                        backgroundImage: config
                          ? `url(${config.radarImage})`
                          : `url(/maps/${mapRaw}_radar.png)`,
                        filter: "grayscale(60%) brightness(0.4)",
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <Flame className="h-8 w-8 text-[var(--error)]" />
                    </div>
                    <div className="p-4">
                      <p className="font-medium text-[var(--text-primary)]">
                        {mapDisplayName(mapRaw)}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        <span className="font-mono">{info.count}</span> match{info.count !== 1 ? "es" : ""}
                        {" — "}
                        Last played {info.latestDate.toLocaleDateString()}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Individual matches section */}
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Individual Matches
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {matches.map((match) => (
                <Link key={match.id} href={`/heatmaps/${match.id}`}>
                  <Card className="group p-3 transition-all duration-150 hover:border-[var(--border-hover)]">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {mapDisplayName(match.map)}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {match.date.toLocaleDateString()} — <span className="font-mono">{match.scoreCT}:{match.scoreT}</span>
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
