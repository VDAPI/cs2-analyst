import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { Flame } from "lucide-react";
import { Card } from "@/components/ui";
import { mapDisplayName } from "@/lib/utils/mapNames";
import {
  ToolEmptyState,
  ToolMatchGrid,
  ToolPageIntro,
  formatMatchDate,
  radarUrl,
} from "@/components/tools/tool-match-grid";

function matchesLabel(n: number) {
  if (n === 1) return "mecz";
  const lastTwo = n % 100;
  const last = n % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "mecze" : "meczów";
}

export default async function HeatmapsListPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  const matches = userId
    ? await prisma.match.findMany({
        where: { upload: { userId } },
        select: { id: true, map: true, date: true, scoreCT: true, scoreT: true },
        orderBy: { date: "desc" },
      })
    : [];

  // Group by map for the cross-match heatmaps
  const mapGroups = new Map<string, { count: number; latestDate: Date }>();
  for (const m of matches) {
    const g = mapGroups.get(m.map);
    if (g) {
      g.count++;
      if (m.date > g.latestDate) g.latestDate = m.date;
    } else {
      mapGroups.set(m.map, { count: 1, latestDate: m.date });
    }
  }
  const sortedMaps = [...mapGroups.entries()].sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="space-y-6">
      <ToolPageIntro
        overline="Narzędzia"
        title="Heatmapy"
        text="Gdzie zabijasz i gdzie giniesz: zbiorczo dla każdej mapy albo dla jednego meczu."
      />

      {sortedMaps.length === 0 ? (
        <ToolEmptyState title="Brak meczów do analizy" text="Wgraj demo, aby zobaczyć heatmapy zabójstw i śmierci." />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="label-overline text-[var(--text-tertiary)]">Zbiorczo per mapa</h2>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
              {sortedMaps.map(([mapRaw, info]) => (
                <Link
                  key={mapRaw}
                  href={`/heatmaps/map/${mapRaw}`}
                  className="group rounded-xl focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-glow)]"
                >
                  <Card className="relative overflow-hidden p-0 md:p-0 group-hover:border-[var(--border-active)]">
                    <div className="relative h-36 overflow-hidden">
                      <div
                        className="absolute inset-0 bg-cover bg-center opacity-40 grayscale transition-transform duration-200 group-hover:scale-105"
                        style={{ backgroundImage: `url(${radarUrl(mapRaw)})` }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-1)] to-transparent" />
                      <span className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--glass-bg)] text-[var(--text-secondary)] backdrop-blur-md transition-colors duration-150 group-hover:bg-[var(--accent)] group-hover:text-[var(--on-accent)]">
                        <Flame className="h-4 w-4" />
                      </span>
                    </div>
                    <div className="px-4 pb-4">
                      <p className="font-display text-base font-semibold text-[var(--text-primary)]">
                        {mapDisplayName(mapRaw)}
                      </p>
                      <p className="text-[13px] text-[var(--text-tertiary)]">
                        <span className="font-mono tabular-nums">{info.count}</span> {matchesLabel(info.count)} · ostatni{" "}
                        {formatMatchDate(info.latestDate)}
                      </p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="label-overline text-[var(--text-tertiary)]">Pojedyncze mecze</h2>
            <ToolMatchGrid matches={matches} hrefBase="/heatmaps" icon={Flame} actionLabel="Otwórz heatmapę" />
          </section>
        </>
      )}
    </div>
  );
}
