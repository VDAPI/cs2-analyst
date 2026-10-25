import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Trophy } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Badge, Card, PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { NormFilters } from "@/components/norms/norm-filters";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { formatDateTime } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";
import {
  MIN_NORM_N,
  medianByMetric,
  proNorm,
  rankBucket,
  sampleKey,
  WEAPON_METRICS,
  type NormSide,
  type NormTable,
  type SampleMetrics,
  type Situation,
} from "@/lib/norms/norms";
import { getNormTable, normsRefreshedAt, NORMS_STAMP, proPoolSize } from "@/lib/norms/persist";
import { formatNormValue, METRIC_GROUPS, METRIC_UNIT, rankLabel, SITUATION_KEY } from "@/lib/norms/view";

export const dynamic = "force-dynamic";

/** How many of the player's latest matches "Ty" is the median of. */
const YOUR_MATCHES = 10;

interface Props {
  searchParams: Promise<{ map?: string; side?: string; rank?: string }>;
}

interface Row {
  key: string;
  label: string;
  unit: string;
  metric: string;
  situation: Situation;
}

export default async function ProNormsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const steamId = session.user.steamId ?? null;
  const { t } = await getT();
  const sp = await searchParams;

  const side: NormSide = sp.side === "CT" || sp.side === "T" ? sp.side : "all";
  const [mapRows, poolRows, myRank, pool, refreshedAt] = await Promise.all([
    prisma.metricNorm.findMany({ where: { map: { not: "all" } }, distinct: ["map"], select: { map: true } }),
    prisma.metricNorm.findMany({
      where: { pool: { notIn: ["pro", "all"] }, NOT: { pool: { startsWith: "pro/" } } },
      distinct: ["pool"],
      select: { pool: true },
    }),
    steamId
      ? prisma.matchPlayer.findFirst({
          where: { steamId, rankType: { not: null }, match: { upload: { kind: "PLAYER", userId } } },
          orderBy: { match: { date: "desc" } },
          select: { rankType: true, rankValue: true },
        })
      : null,
    proPoolSize(prisma),
    normsRefreshedAt(prisma),
  ]);
  const ownRank = myRank ? rankBucket(myRank.rankType, myRank.rankValue) : null;
  const rankPools = [...new Set([...poolRows.map((p) => p.pool), ...(ownRank ? [ownRank] : [])])].sort(compareRankPools);
  const rank = sp.rank && (sp.rank === "all" || rankPools.includes(sp.rank)) ? sp.rank : (ownRank ?? "all");
  const maps = mapRows.map((m) => m.map).sort();
  const map = sp.map && maps.includes(sp.map) ? sp.map : "all";

  const table = await getNormTable(prisma, { pools: ["pro", "all", ...(rank !== "all" ? [rank] : [])], map });

  // The player's own median over their latest analysed matches (same side filter).
  const mine = steamId
    ? await prisma.normSample.findMany({
        where: { steamId, side, version: NORMS_STAMP, pro: false, match: { upload: { kind: "PLAYER", userId }, ...(map !== "all" ? { map } : {}) } },
        orderBy: { match: { date: "desc" } },
        take: YOUR_MATCHES,
        select: { metrics: true },
      })
    : [];
  const you = medianByMetric(mine.map((m) => m.metrics as unknown as SampleMetrics));

  const ctx = { map, side };
  const anyReference = METRIC_GROUPS.some((g) => g.metrics.some((m) => proNorm(table, m, ctx)?.source === "reference"));
  const rowsFor = (metrics: readonly string[], situation: Situation = "all"): Row[] =>
    metrics.map((metric) => ({
      key: sampleKey(metric, situation),
      metric,
      situation,
      unit: METRIC_UNIT[metric] ?? "",
      label:
        situation === "all"
          ? t(`norms.metric.${metric}` as MessageKey)
          : `${t(`norms.metric.${metric}` as MessageKey)} · ${t(SITUATION_KEY[situation])}`,
    }));
  const weaponRows = (["rifle", "awp", "smg", "pistol"] as Situation[]).flatMap((s) => rowsFor(WEAPON_METRICS, s));

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader eyebrow={t("norms.eyebrow")} title={t("norms.title")} description={t("norms.description")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t("norms.admin.statPool")} value={pool.matches} highlight={pool.matches > 0} />
        <StatCard label={t("norms.admin.statPlayers")} value={pool.players} />
        <StatCard
          label={t("norms.rank")}
          value={rankLabel(t, rank)}
          className="col-span-2 lg:col-span-1"
          hint={refreshedAt ? t("norms.admin.lastRefresh", { date: formatDateTime(refreshedAt) }) : t("norms.admin.neverRefreshed")}
        />
      </div>

      <Card className="space-y-1 text-sm text-[var(--text-secondary)]">
        {pool.players > 0 ? (
          <p>{t("norms.poolMeasured", { matches: pool.matches, players: pool.players })}</p>
        ) : (
          <p>{t("norms.poolReference")}</p>
        )}
        {anyReference && pool.players > 0 && <p className="text-[var(--text-tertiary)]">{t("norms.poolPartial", { min: MIN_NORM_N })}</p>}
        <p className="text-[var(--text-tertiary)]">
          {mine.length > 0 ? t("norms.youHint", { n: mine.length }) : t("norms.youNone")}
        </p>
      </Card>

      <Suspense>
        <NormFilters
          map={map}
          side={side}
          rank={rank}
          maps={[{ value: "all", label: t("norms.allMaps") }, ...maps.map((m) => ({ value: m, label: mapDisplayName(m) }))]}
          ranks={[{ value: "all", label: t("norms.rankAll") }, ...rankPools.map((p) => ({ value: p, label: rankLabel(t, p) }))]}
        />
      </Suspense>

      {METRIC_GROUPS.map((g) => (
        <section key={g.category} className="space-y-2" aria-labelledby={`norms-${g.category}`}>
          <SectionTitle>
            <span id={`norms-${g.category}`}>{t(`norms.category.${g.category}` as MessageKey)}</span>
          </SectionTitle>
          <NormTableView rows={rowsFor(g.metrics)} table={table} ctx={ctx} rank={rank} you={you} t={t} />
        </section>
      ))}

      <section className="space-y-2" aria-labelledby="norms-weapons">
        <SectionTitle>
          <span id="norms-weapons">{t("norms.weaponTitle")}</span>
        </SectionTitle>
        <p className="text-sm text-[var(--text-tertiary)]">{t("norms.weaponHint")}</p>
        <NormTableView rows={weaponRows} table={table} ctx={ctx} rank={rank} you={you} t={t} />
      </section>

      {pool.players === 0 && (
        <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Trophy className="h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
          {t("norms.admin.terms")}
        </p>
      )}
    </div>
  );
}

/** "faceit:2" before "faceit:10", FACEIT before Premier before MM. */
function compareRankPools(a: string, b: string): number {
  const order = (p: string) => (p.startsWith("faceit") ? 0 : p.startsWith("premier") ? 1 : 2);
  const value = (p: string) => Number(p.split(":")[1]) || 0;
  return order(a) - order(b) || value(a) - value(b);
}

function NormTableView({
  rows,
  table,
  ctx,
  rank,
  you,
  t,
}: {
  rows: Row[];
  table: NormTable;
  ctx: { map: string; side: NormSide };
  rank: string;
  you: Record<string, { value: number; matches: number }>;
  t: TFunction;
}) {
  return (
    <div className="table-scroll rounded-xl border border-[var(--border)]">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("norms.colMetric")}</th>
            <th className="text-right">{t("norms.colYou")}</th>
            <th className="text-right">{t("norms.colPro")}</th>
            <th className="text-right">{t("norms.colProRange")}</th>
            <th className="text-right">{rankLabel(t, rank)}</th>
            <th className="text-right">{t("norms.colN")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pro = proNorm(table, r.metric, { ...ctx, situation: r.situation });
            const rankRow = table.get(rank, r.metric, { ...ctx, situation: r.situation });
            const mine = you[r.key];
            return (
              <tr key={r.key}>
                <td className="min-w-[120px] max-w-[150px] whitespace-normal sm:max-w-[260px]">{r.label}</td>
                <td className="text-right font-mono text-[var(--text-primary)]">
                  {mine ? formatNormValue(mine.value, r.unit) : "–"}
                </td>
                <td className={cn("text-right font-mono font-semibold", pro ? "text-[var(--accent-2)]" : "text-[var(--text-tertiary)]")}>
                  {pro ? `${pro.source === "reference" ? "≈" : ""}${formatNormValue(pro.p50, r.unit)}` : "–"}
                </td>
                <td className="whitespace-nowrap text-right font-mono text-[var(--text-secondary)]">
                  {pro ? `${formatNormValue(pro.p25, r.unit)}–${formatNormValue(pro.p75, r.unit)}` : "–"}
                </td>
                <td className="text-right font-mono text-[var(--text-secondary)]">
                  {rankRow ? formatNormValue(rankRow.p50, r.unit) : "–"}
                </td>
                <td className="text-right">
                  {pro?.source === "pro" ? (
                    <span className="font-mono text-xs text-[var(--text-tertiary)]">{pro.n}</span>
                  ) : pro ? (
                    <Badge variant="default" className="text-[10px]">{t("norms.approx")}</Badge>
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">{t("norms.noData")}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
