import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowLeft, Download, Target } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { Card, EmptyState, PageHeader, SectionTitle, buttonVariants } from "@/components/ui";
import { LineupCard } from "@/components/lineups/lineup-card";
import { MAP_CONFIGS } from "@/lib/utils/maps";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { CANVAS_COLORS, grenadeStyle } from "@/lib/canvas/palette";
import { computeAndPersistUtility, getMapLineups, getPlaceLookup } from "@/lib/analysis/persist-utility";
import { loadMapLanes } from "@/lib/team/map-lanes-load";
import { shortPlace } from "@/lib/team/map-lanes";
import { withZones } from "@/lib/team/zones";
import { LINEUP_MIN_MATCHES, LINEUP_MIN_SAMPLES, type Lineup } from "@/lib/analysis/lineups";
import type { GrenadeKind, Point3 } from "@/lib/analysis/utility";
import { cfgFileName, execName } from "@/lib/training/cfg";
import { masteryPercent, type LineupPick } from "@/lib/training/lineup-trainer";
import { findingPractice, loadMastered } from "@/lib/training/persist";
import { findingCopy } from "@/lib/coach/copy";

/**
 * Lineup base per map (S11) and the lineup trainer (S22): throws repeated
 * from the same spot and angle across analysed matches, with the
 * setpos/setang to practise them, a "mastered" mark per player, a practice
 * .cfg, and — from a finding card (`?finding=`) — the better lineups for
 * that grenade.
 */

interface Props {
  searchParams: Promise<{ map?: string; type?: string; show?: string; finding?: string }>;
}

const TYPES: GrenadeKind[] = ["SMOKE", "FLASH", "MOLOTOV", "HE"];
type Show = "all" | "todo" | "mastered";
const SHOWS: Array<{ id: Show; key: MessageKey }> = [
  { id: "all", key: "lineups.showAll" },
  { id: "todo", key: "lineups.showTodo" },
  { id: "mastered", key: "lineups.showMastered" },
];
const REASON_KEY: Record<LineupPick["reason"], MessageKey> = {
  target: "lineups.practiceTarget",
  same_spot: "lineups.practiceSame",
  nearby: "lineups.practiceNearby",
};
/** User's matches on the map whose utility analysis is computed per page view, at most. */
const BACKFILL_PER_VIEW = 6;
const MAX_SHOWN = 60;

export default async function LineupsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { t, locale } = await getT();
  const params = await searchParams;

  // From a finding card: the finding decides the map.
  const practice = params.finding ? await findingPractice(prisma, userId, params.finding) : null;

  const maps = Object.keys(MAP_CONFIGS);
  let map = practice?.map ?? (params.map && MAP_CONFIGS[params.map] ? params.map : null);
  if (!map) {
    const top = await prisma.match.groupBy({
      by: ["map"],
      where: { upload: { kind: "PLAYER", userId }, map: { in: maps } },
      _count: { map: true },
      orderBy: { _count: { map: "desc" } },
      take: 1,
    });
    map = top[0]?.map ?? "de_mirage";
  }
  const type = TYPES.includes(params.type as GrenadeKind) ? (params.type as GrenadeKind) : null;
  const show: Show = params.show === "todo" || params.show === "mastered" ? params.show : "all";

  // Matches analysed before S11 get their utility analysis here, a few per view.
  const missing = await prisma.match.findMany({
    where: { map, upload: { kind: "PLAYER", userId }, utility: { none: {} }, rounds: { some: { ticks: { isNot: null } } } },
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

  // Callouts as players say them: drawn zones first (/callouts), then the
  // admin's names for the demo's callouts.
  const [{ zones }, base] = await Promise.all([loadMapLanes(prisma, map), getPlaceLookup(prisma, map)]);
  const zoned = withZones(zones, base);
  const placeOf = (p: Point3) => {
    const name = zoned(p);
    return name ? shortPlace(map, name) : null;
  };
  const [lineupBase, mastered] = await Promise.all([getMapLineups(prisma, map, placeOf), loadMastered(prisma, userId, map)]);
  const throwerIds = [...new Set(lineupBase.flatMap((l) => l.throwers ?? []))];
  const throwerRows = throwerIds.length
    ? await prisma.matchPlayer.findMany({
        where: { steamId: { in: throwerIds } },
        orderBy: { match: { date: "desc" } },
        distinct: ["steamId"],
        select: { steamId: true, name: true },
      })
    : [];
  const nameOf = new Map(throwerRows.map((r) => [r.steamId, r.name]));
  const all = lineupBase.map((l) => ({ ...l, throwerNames: (l.throwers ?? []).map((id) => nameOf.get(id) ?? id) }));
  const ofType = type ? all.filter((l) => l.type === type) : all.filter((l) => l.type !== "DECOY");
  const lineups = ofType
    .filter((l) => show === "all" || (show === "mastered") === mastered.has(l.key))
    .slice(0, MAX_SHOWN);
  const named = all.some((l) => l.landPlace);
  const config = MAP_CONFIGS[map];
  const doneCount = ofType.filter((l) => mastered.has(l.key)).length;

  const href = (next: { map?: string; type?: GrenadeKind | null; show?: Show }) => {
    const q = new URLSearchParams({ map: next.map ?? map });
    const ty = next.type === undefined ? type : next.type;
    if (ty) q.set("type", ty);
    const sh = next.show ?? show;
    if (sh !== "all") q.set("show", sh);
    return `/lineups?${q.toString()}`;
  };
  const cfgQuery = new URLSearchParams({ kind: "lineups", map });
  if (type) cfgQuery.set("type", type);
  if (show === "mastered") cfgQuery.set("keys", lineups.map((l) => l.key).join(","));
  const cfgFile = cfgFileName("lineups", map);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader eyebrow={t("lineups.eyebrow")} title={t("lineups.title")} description={t("lineups.description")} />

      {params.finding && !practice && (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">{t("lineups.practiceNotFound")}</p>
        </Card>
      )}
      {practice && (
        <PracticeSection
          practice={practice}
          config={config}
          map={map}
          mastered={mastered}
          t={t}
          copy={findingCopy(practice.type, locale)}
        />
      )}

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
      {ofType.length > 0 && (
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <nav aria-label={t("lineups.show")} className="flex flex-wrap gap-2">
            {SHOWS.map((s) => (
              <Pill key={s.id} href={href({ show: s.id })} active={s.id === show}>
                {t(s.key)}
              </Pill>
            ))}
          </nav>
          <p className="font-mono text-sm text-[var(--text-secondary)] sm:ml-auto">
            {t("lineups.masteryCount", { done: doneCount, total: ofType.length, pct: masteryPercent(ofType, mastered) })}
          </p>
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState
          icon={Target}
          title={t("lineups.emptyTitle")}
          description={t("lineups.emptyText", { samples: LINEUP_MIN_SAMPLES, matches: LINEUP_MIN_MATCHES })}
        />
      ) : lineups.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">{t("lineups.emptyFiltered")}</p>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3 lg:sticky lg:top-20 lg:self-start">
            {config && <LineupRadar config={config} lineups={lineups} label={t("lineups.radarLabel", { map: mapDisplayName(map) })} />}
            <p className="text-xs text-[var(--text-tertiary)]">{t("lineups.howTo")}</p>
            {!named && <p className="text-xs text-[var(--text-tertiary)]">{t("lineups.unnamed")}</p>}
            <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3">
              <a
                href={`/api/training/cfg?${cfgQuery.toString()}`}
                download={cfgFile}
                className={buttonVariants({ variant: "primary", size: "sm", className: "w-full sm:w-auto" })}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                {t("lineups.downloadCfg")}
              </a>
              <p className="text-xs text-[var(--text-tertiary)]">{t("lineups.cfgHint", { exec: execName(cfgFile) })}</p>
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <p className="label-overline text-[var(--text-tertiary)]">{t("lineups.count", { n: lineups.length })}</p>
            <ol className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {lineups.map((l, i) => (
                <LineupCard key={l.key} lineup={l} index={i} map={map} mastered={mastered.has(l.key)} t={t} />
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

type RadarCfg = { posX: number; posY: number; scale: number; width: number; height: number; radarImage: string };

function LineupRadar({
  config,
  lineups,
  label,
  mark,
}: {
  config: RadarCfg;
  lineups: Lineup[];
  label: string;
  /** Where the player's own grenade landed (practice view). */
  mark?: Point3 | null;
}) {
  const m = mark ? toRadar(config, mark.x, mark.y) : null;
  return (
    <svg
      viewBox={`0 0 ${config.width} ${config.height}`}
      className="block aspect-square w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)]"
      role="img"
      aria-label={label}
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
      {m && (
        <g stroke={CANVAS_COLORS.mistake} strokeWidth={6} strokeLinecap="round">
          <line x1={m.x - 16} y1={m.y - 16} x2={m.x + 16} y2={m.y + 16} />
          <line x1={m.x - 16} y1={m.y + 16} x2={m.x + 16} y2={m.y - 16} />
        </g>
      )}
    </svg>
  );
}

function PracticeSection({
  practice: p,
  config,
  map,
  mastered,
  copy,
  t,
}: {
  practice: NonNullable<Awaited<ReturnType<typeof findingPractice>>>;
  config: RadarCfg | undefined;
  map: string;
  mastered: Set<string>;
  copy: { label: string; drill: string };
  t: TFunction;
}) {
  const picks = p.picks;
  const cfgQuery = new URLSearchParams({ kind: "lineups", map, keys: picks.map((x) => x.lineup.key).join(",") });
  const cfgFile = cfgFileName("lineups", map);
  return (
    <section aria-labelledby="lineup-practice" className="min-w-0 space-y-4 rounded-2xl border border-[var(--border-active)] bg-[var(--surface-1)] p-4 md:p-5">
      <SectionTitle
        action={
          <Link href={`/report/${p.matchId}?player=${p.steamId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t("lineups.practiceReport")}
          </Link>
        }
      >
        <span id="lineup-practice">{t("lineups.practiceTitle")}</span>
      </SectionTitle>
      <p className="text-sm text-[var(--text-tertiary)]">
        {t("lineups.practiceFrom", { label: copy.label, round: p.roundNumber })} · {mapDisplayName(map)}
        {p.side ? ` · ${p.side}` : ""}
      </p>
      {picks.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{t(p.thrown ? "lineups.practiceNone" : "lineups.practiceNoThrow")}</p>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            {config && (
              <LineupRadar
                config={config}
                lineups={picks.map((x) => x.lineup)}
                mark={p.thrown?.land ?? null}
                label={t("lineups.radarLabel", { map: mapDisplayName(map) })}
              />
            )}
            <a
              href={`/api/training/cfg?${cfgQuery.toString()}`}
              download={cfgFile}
              className={buttonVariants({ variant: "cta", size: "sm", className: "w-full" })}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {t("lineups.practiceCfg")}
            </a>
            <p className="text-xs text-[var(--text-tertiary)]">{t("lineups.cfgHint", { exec: execName(cfgFile) })}</p>
          </div>
          <ol className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            {picks.map((x, i) => (
              <LineupCard
                key={x.lineup.key}
                lineup={x.lineup}
                index={i}
                map={map}
                mastered={mastered.has(x.lineup.key)}
                note={t(REASON_KEY[x.reason], { off: x.offBy })}
                t={t}
              />
            ))}
          </ol>
        </div>
      )}
      <p className="text-xs text-[var(--text-tertiary)]">{copy.drill}</p>
    </section>
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
