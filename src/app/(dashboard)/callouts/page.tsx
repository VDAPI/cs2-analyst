import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { humanizePlace, PLACE_CELL } from "@/lib/analysis/places";
import { MAP_CONFIGS } from "@/lib/utils/maps";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { ctSpotOf, mapLanes, placeKey, shortPlace } from "@/lib/team/map-lanes";
import { loadMapLanes } from "@/lib/team/map-lanes-load";
import { currentUserIsAdmin } from "@/lib/admin/session";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/ui";
import { CalloutMap, type CalloutCell, type CalloutPlace } from "@/components/maps/callout-map";

interface Props {
  searchParams: Promise<{ map?: string }>;
}

/**
 * /callouts — every position name the demos give on a map (the game's own
 * nav-mesh callouts, learned per 128-unit cell), drawn on the radar with the
 * names the team analysis uses, so a player can check them.
 */
export default async function CalloutsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/callouts");
  const query = await searchParams;

  const counts = await prisma.mapPlaceCell.groupBy({ by: ["map"], _sum: { count: true } });
  const maps = counts
    .filter((c) => MAP_CONFIGS[c.map])
    .map((c) => c.map)
    .sort();
  const map = maps.includes(query.map ?? "") ? query.map! : maps.includes("de_mirage") ? "de_mirage" : maps[0];
  const config = map ? MAP_CONFIGS[map] : undefined;

  const rows = map
    ? await prisma.mapPlaceCell.findMany({ where: { map }, select: { cx: true, cy: true, cz: true, place: true, count: true } })
    : [];
  // One name per 2D cell (the most sampled across heights) for the drawing;
  // places keep every cell for their label position and sample count.
  const best = new Map<string, { cx: number; cy: number; place: string; count: number }>();
  const places = new Map<string, { sx: number; sy: number; n: number; cells: number }>();
  for (const r of rows) {
    const key = `${r.cx}|${r.cy}`;
    const b = best.get(key);
    if (!b || r.count > b.count) best.set(key, { cx: r.cx, cy: r.cy, place: r.place, count: r.count });
    const p = places.get(r.place) ?? { sx: 0, sy: 0, n: 0, cells: 0 };
    p.sx += (r.cx + 0.5) * PLACE_CELL * r.count;
    p.sy += (r.cy + 0.5) * PLACE_CELL * r.count;
    p.n += r.count;
    p.cells++;
    places.set(r.place, p);
  }
  const [{ overrides, zones }, editable] = await Promise.all([
    map ? loadMapLanes(prisma, map) : Promise.resolve({ overrides: [], zones: [] }),
    currentUserIsAdmin(),
  ]);
  const edited = new Set(overrides.map((o) => o.place));
  const lanes = map ? mapLanes(map) : null;
  const laneIn = (raw: string, site: "A" | "B") => lanes?.lanes[site].find((l) => l.places.includes(placeKey(raw)))?.name ?? "";
  const placeList: CalloutPlace[] = [...places.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([raw, p]) => {
      const human = humanizePlace(raw);
      return {
        raw,
        human,
        short: map ? shortPlace(map, human) : human,
        ctSpot: map ? ctSpotOf(map, human) ?? "" : "",
        laneA: laneIn(human, "A"),
        laneB: laneIn(human, "B"),
        edited: edited.has(placeKey(raw)),
        x: p.sx / p.n,
        y: p.sy / p.n,
        samples: p.n,
      };
    });
  const cells: CalloutCell[] = [...best.values()].map((c) => ({
    x: (c.cx + 0.5) * PLACE_CELL,
    y: (c.cy + 0.5) * PLACE_CELL,
    place: c.place,
  }));

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Mapy"
        title="Pozycje z dema"
        description="Nazwy pozycji, które gra zapisuje w demie, na radarze mapy, i strefy narysowane przez admina (mają pierwszeństwo). Obok nazwa używana w analizie drużynowej, pozycja CT i wejście T. Najedź na mapę albo kliknij nazwę na liście."
      />
      <nav aria-label="Mapy" className="flex flex-wrap gap-2">
        {maps.map((m) => (
          <Link
            key={m}
            href={`/callouts?map=${m}`}
            aria-current={m === map ? "true" : undefined}
            className={cn(
              "flex min-h-10 items-center rounded-lg border px-3 text-sm transition-colors",
              m === map
                ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
            )}
          >
            {mapDisplayName(m)}
          </Link>
        ))}
      </nav>
      {config ? (
        <CalloutMap
          config={{ posX: config.posX, posY: config.posY, scale: config.scale, width: config.width, height: config.height, radarImage: config.radarImage }}
          cellSize={PLACE_CELL}
          cells={cells}
          places={placeList}
          map={map!}
          zones={zones}
          editable={editable}
          options={{
            ctSpots: lanes?.ctSpots.map((c) => c.name) ?? [],
            laneA: lanes?.lanes.A.map((l) => l.name) ?? [],
            laneB: lanes?.lanes.B.map((l) => l.name) ?? [],
          }}
        />
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">Brak dem z danymi pozycji.</p>
      )}
    </div>
  );
}
