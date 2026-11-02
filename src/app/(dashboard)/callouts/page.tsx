import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { humanizePlace, PLACE_CELL } from "@/lib/analysis/places";
import { ACTIVE_DUTY_MAPS, MAP_CONFIGS } from "@/lib/utils/maps";
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
 * /callouts — every map of the tournament pool (and any other map with data):
 * the position names the demos give (the game's own nav-mesh callouts, learned
 * per 128-unit cell) and the zones an admin drew, on the radar, with the names
 * every player's analysis uses. A map without demos starts as an empty radar.
 */
export default async function CalloutsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?callbackUrl=/callouts");
  const query = await searchParams;

  const [cellMaps, zoneMaps] = await Promise.all([
    prisma.mapPlaceCell.groupBy({ by: ["map"] }),
    prisma.mapZone.groupBy({ by: ["map"] }),
  ]);
  // The pool first, then maps out of it that already have data (Train, Overpass…).
  const others = [...cellMaps, ...zoneMaps].map((c) => c.map).filter((m) => MAP_CONFIGS[m] && !ACTIVE_DUTY_MAPS.includes(m));
  const maps = [...ACTIVE_DUTY_MAPS, ...[...new Set(others)].sort()];
  const map = maps.includes(query.map ?? "") ? query.map! : "de_mirage";
  const config = MAP_CONFIGS[map];

  const rows = await prisma.mapPlaceCell.findMany({ where: { map }, select: { cx: true, cy: true, cz: true, place: true, count: true } });
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
  const [{ overrides, zones }, editable] = await Promise.all([loadMapLanes(prisma, map), currentUserIsAdmin()]);
  const edited = new Set(overrides.map((o) => o.place));
  const lanes = mapLanes(map);
  const laneIn = (raw: string, site: "A" | "B") => lanes?.lanes[site].find((l) => l.places.includes(placeKey(raw)))?.name ?? "";
  const placeList: CalloutPlace[] = [...places.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(([raw, p]) => {
      const human = humanizePlace(raw);
      return {
        raw,
        human,
        short: shortPlace(map, human),
        ctSpot: ctSpotOf(map, human) ?? "",
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
        title="Pozycje na mapach"
        description="Strefy narysowane przez admina obowiązują w analizach wszystkich graczy i mają pierwszeństwo przed nazwami, które gra zapisuje w demie. Obok nazwa używana w analizie, pozycja CT i wejście T. Najedź na mapę albo kliknij nazwę na liście."
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
      <CalloutMap
        config={{ posX: config.posX, posY: config.posY, scale: config.scale, width: config.width, height: config.height, radarImage: config.radarImage }}
        cellSize={PLACE_CELL}
        cells={cells}
        places={placeList}
        map={map}
        zones={zones}
        editable={editable}
        options={{
          ctSpots: lanes?.ctSpots.map((c) => c.name) ?? [],
          laneA: lanes?.lanes.A.map((l) => l.name) ?? [],
          laneB: lanes?.lanes.B.map((l) => l.name) ?? [],
        }}
      />
    </div>
  );
}
