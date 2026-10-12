import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Target } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n/translate";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { MAP_CONFIGS } from "@/lib/utils/maps";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { CANVAS_COLORS, grenadeStyle } from "@/lib/canvas/palette";
import { computeAndPersistUtility, getMapLineups } from "@/lib/analysis/persist-utility";
import { LINEUP_MIN_MATCHES, LINEUP_MIN_SAMPLES, lineupName, setposCommand, type Lineup } from "@/lib/analysis/lineups";
import type { GrenadeKind, ThrowTechnique } from "@/lib/analysis/utility";
import { CopySetpos } from "./copy-setpos";

/**
 * Lineup base per map (S11): throws repeated from the same spot and angle
 * across analysed matches, with the setpos/setang to practise them.
 */

interface Props {
  searchParams: Promise<{ map?: string; type?: string }>;
}

const TYPES: GrenadeKind[] = ["SMOKE", "FLASH", "MOLOTOV", "HE"];
const TECH_KEY: Record<ThrowTechnique, MessageKey> = {
  stand: "lineups.techStand",
  walk: "lineups.techWalk",
  run: "lineups.techRun",
  jump: "lineups.techJump",
};
/** User's matches on the map whose utility analysis is computed per page view, at most. */
const BACKFILL_PER_VIEW = 6;
const MAX_SHOWN = 60;

export default async function LineupsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { t } = await getT();
  const params = await searchParams;

  const maps = Object.keys(MAP_CONFIGS);
  let map = params.map && MAP_CONFIGS[params.map] ? params.map : null;
  if (!map) {
    const top = await prisma.match.groupBy({
      by: ["map"],
      where: { upload: { userId }, map: { in: maps } },
      _count: { map: true },
      orderBy: { _count: { map: "desc" } },
      take: 1,
    });
    map = top[0]?.map ?? "de_mirage";
  }
  const type = TYPES.includes(params.type as GrenadeKind) ? (params.type as GrenadeKind) : null;

  // Matches analysed before S11 get their utility analysis here, a few per view.
  const missing = await prisma.match.findMany({
    where: { map, upload: { userId }, utility: { none: {} }, rounds: { some: { ticks: { isNot: null } } } },
    select: { id: true },
    orderBy: { date: "desc" },
    take: BACKFILL_PER_VIEW,
  });
  for (const m of missing) {
    try {
      await computeAndPersistUtility(prisma, m.id);
    } catch (error) {
      console.error(`[lineups] utility backfill failed match=${m.id}:`, error);
    }
  }

  const all = await getMapLineups(prisma, map);
  const lineups = (type ? all.filter((l) => l.type === type) : all.filter((l) => l.type !== "DECOY")).slice(0, MAX_SHOWN);
  const named = all.some((l) => l.landPlace);
  const config = MAP_CONFIGS[map];

  const href = (next: { map?: string; type?: GrenadeKind | null }) => {
    const q = new URLSearchParams({ map: next.map ?? map });
    const ty = next.type === undefined ? type : next.type;
    if (ty) q.set("type", ty);
    return `/lineups?${q.toString()}`;
  };

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader eyebrow={t("lineups.eyebrow")} title={t("lineups.title")} description={t("lineups.description")} />

      <nav aria-label={t("lineups.map")} className="-mx-4 md:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0">
          {maps.map((m) => (
            <Pill key={m} href={href({ map: m })} active={m === map}>
              {mapDisplayName(m)}
            </Pill>
          ))}
        </div>
      </nav>
      <nav aria-label={t("lineups.type")} className="-mx-4 md:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0">
          <Pill href={href({ type: null })} active={type == null}>
            {t("lineups.all")}
          </Pill>
          {TYPES.map((ty) => (
            <Pill key={ty} href={href({ type: ty })} active={ty === type}>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: grenadeStyle(ty).token }} aria-hidden />
              {grenadeStyle(ty).label}
            </Pill>
          ))}
        </div>
      </nav>

      {lineups.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t("lineups.emptyTitle")}
          description={t("lineups.emptyText", { samples: LINEUP_MIN_SAMPLES, matches: LINEUP_MIN_MATCHES })}
        />
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2 lg:sticky lg:top-20 lg:self-start">
            {config && (
              <svg
                viewBox={`0 0 ${config.width} ${config.height}`}
                className="block aspect-square w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)]"
                role="img"
                aria-label={t("lineups.radarLabel", { map: mapDisplayName(map) })}
              >
                <image href={config.radarImage} width={config.width} height={config.height} opacity={0.75} />
                {lineups.map((l, i) => {
                  const a = toRadar(config, l.x, l.y);
                  const b = toRadar(config, l.land.x, l.land.y);
                  const color = grenadeStyle(l.type).line;
                  return (
                    <g key={l.key}>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={3} strokeDasharray="10 8" opacity={0.8} />
                      <circle cx={a.x} cy={a.y} r={7} fill={color} />
                      <circle cx={b.x} cy={b.y} r={20} fill="none" stroke={color} strokeWidth={4} />
                      <text x={b.x} y={b.y + 9} textAnchor="middle" fontSize={26} fontWeight={700} fill={CANVAS_COLORS.textPrimary}>
                        {i + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            <p className="text-xs text-[var(--text-tertiary)]">{t("lineups.howTo")}</p>
            {!named && <p className="text-xs text-[var(--text-tertiary)]">{t("lineups.unnamed")}</p>}
          </div>

          <div className="min-w-0 space-y-3">
            <p className="label-overline text-[var(--text-tertiary)]">{t("lineups.count", { n: lineups.length })}</p>
            <ol className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {lineups.map((l, i) => (
                <LineupCard key={l.key} lineup={l} index={i} t={t} />
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function toRadar(c: { posX: number; posY: number; scale: number }, x: number, y: number) {
  return { x: (x - c.posX) / c.scale, y: (c.posY - y) / c.scale };
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
        active
          ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
          : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
      )}
    >
      {children}
    </Link>
  );
}

function LineupCard({
  lineup: l,
  index,
  t,
}: {
  lineup: Lineup;
  index: number;
  t: Awaited<ReturnType<typeof getT>>["t"];
}) {
  const cmd = setposCommand(l);
  return (
    <li>
      <Card className="h-full space-y-3 p-4 md:p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-bold text-[var(--on-accent)]"
            style={{ backgroundColor: grenadeStyle(l.type).token }}
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">{lineupName(l, index)}</h3>
            <p className="font-mono text-xs text-[var(--text-tertiary)]">
              {t("lineups.samples", { n: l.samples, matches: l.matches })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="neutral">{t(TECH_KEY[l.technique])}</Badge>
          {l.side === "both" ? (
            <Badge variant="neutral">{t("lineups.sideBoth")}</Badge>
          ) : (
            <Badge variant={l.side === "CT" ? "ct" : "t"}>{l.side}</Badge>
          )}
        </div>
        <code className="block break-all rounded-lg bg-[var(--surface-2)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
          {cmd}
        </code>
        <CopySetpos command={cmd} />
      </Card>
    </li>
  );
}
