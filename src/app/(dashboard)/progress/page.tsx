import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ClipboardCheck, ExternalLink, TrendingUp, Upload } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { Card, EmptyState, PageHeader, SectionTitle, buttonVariants } from "@/components/ui";
import { MapThumb, ResultBadge } from "@/components/match";
import { MetricTrendCard } from "@/components/charts/lazy-charts";
import { BadgeGrid } from "@/components/progress/badge-grid";
import { GoalsPanel, type GoalMetricOption } from "@/components/progress/goals-panel";
import { loadProgress } from "@/lib/progress/load";
import { buildProgressView } from "@/lib/progress/view";
import { computeBadges } from "@/lib/progress/badges";
import { GOAL_WINDOW, MAX_GOALS, evaluateGoal, suggestGoals, type GoalStatus } from "@/lib/progress/goals";
import {
  MIN_TREND_POINTS,
  PROGRESS_METRICS,
  PROGRESS_WINDOW,
  aggregateWindow,
  formatProgressValue,
  progressMetric,
} from "@/lib/progress/metrics";
import { profilePath } from "@/lib/sharing/share";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import type { MessageKey } from "@/lib/i18n/translate";

const WINDOWS = [10, 20, 50];

interface Props {
  searchParams: Promise<{ player?: string; n?: string; pick?: string }>;
}

const HOW_KEY: Record<string, MessageKey> = {
  requested: "progress.howRequested",
  steam: "progress.howSteam",
  faceit: "progress.howFaceit",
  frequent: "progress.howFrequent",
};

export default async function ProgressPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const query = await searchParams;
  const { t } = await getT();
  const n = WINDOWS.includes(Number(query.n)) ? Number(query.n) : PROGRESS_WINDOW;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { steamId: true, faceitNickname: true, publicProfile: true, publicSlug: true },
  });
  const data = await loadProgress(prisma, {
    userId,
    requested: query.player,
    sessionSteamId: user?.steamId,
    faceitNickname: user?.faceitNickname,
    limit: n,
  });

  const header = (description: React.ReactNode, actions?: React.ReactNode) => (
    <PageHeader eyebrow={t("progress.eyebrow")} title={t("progress.title")} description={description} actions={actions} />
  );

  if (data.totalMatches === 0) {
    return (
      <div className="space-y-6">
        {header(t("progress.description"))}
        <EmptyState
          icon={TrendingUp}
          title={t("progress.emptyTitle")}
          description={t("progress.emptyBody")}
          action={
            <Link href="/upload" className={buttonVariants({ variant: "cta" })}>
              <Upload className="h-4 w-4" aria-hidden />
              {t("progress.upload")}
            </Link>
          }
        />
      </div>
    );
  }

  const picker = (
    <Card className="space-y-3">
      <div>
        <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("progress.pickPlayer")}</h2>
        {!data.steamId && <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("progress.pickPlayerHint")}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {data.candidates.map((c) => (
          <Link
            key={c.steamId}
            href={`/progress?player=${c.steamId}${n !== PROGRESS_WINDOW ? `&n=${n}` : ""}`}
            aria-current={c.steamId === data.steamId ? "true" : undefined}
            className={cn(
              "flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
              c.steamId === data.steamId
                ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
            )}
          >
            <span className="min-w-0 truncate">{c.name}</span>
            <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
              {t("progress.playerMatches", { n: c.matches })}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );

  if (!data.steamId || data.matches.length === 0) {
    return (
      <div className="space-y-6">
        {header(t("progress.description"))}
        {picker}
      </div>
    );
  }

  const matches = data.matches;
  const view = buildProgressView(matches);
  const name = matches[matches.length - 1].player.name;
  const playerQuery = data.how === "requested" ? `player=${data.steamId}&` : "";

  // Goals: judged on the last GOAL_WINDOW matches; a first hit is stored.
  const goalRows = await prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const goals = goalRows
    .map((g) =>
      evaluateGoal(
        { id: g.id, metric: g.metric, target: g.target, achievedAt: g.achievedAt?.toISOString() ?? null, createdAt: g.createdAt.toISOString() },
        matches,
        view.history
      )
    )
    .filter((g): g is GoalStatus => g != null);
  const fresh = goals.filter((g) => g.newlyAchieved);
  if (fresh.length > 0) {
    const now = new Date();
    await prisma.goal.updateMany({ where: { id: { in: fresh.map((g) => g.id) }, achievedAt: null }, data: { achievedAt: now } });
    for (const g of fresh) g.achievedAt = now.toISOString();
  }
  const suggestions = suggestGoals(aggregateWindow(matches), goals.map((g) => g.metric));
  const options: GoalMetricOption[] = PROGRESS_METRICS.map((d) => ({
    key: d.key,
    unit: d.unit,
    decimals: d.decimals,
    direction: d.direction,
    goal: d.goal ?? null,
  }));
  const goalOf = new Map(goals.map((g) => [g.metric, g.target]));

  // Badges look at every analysed match of the player, not just the window.
  const all =
    data.playerMatches > matches.length
      ? (await loadProgress(prisma, { userId, requested: data.steamId, limit: 200 })).matches
      : matches;
  const badges = computeBadges(all, goals.flatMap((g) => (g.achievedAt ? [g.achievedAt] : [])));

  const headline = view.series.filter((s) => s.headline && s.hasData);
  const others = view.series.filter((s) => !s.headline && s.hasData);
  const rating = view.series.find((s) => s.key === "rating")!;
  const serious = view.series.find((s) => s.key === "serious")!;
  const seriousDef = progressMetric("serious")!;
  const ratingDef = progressMetric("rating")!;

  return (
    <div className="min-w-0 space-y-8">
      {header(
        t("progress.descriptionPlayer", { name, n: matches.length, total: data.playerMatches }),
        <nav aria-label={t("progress.windowLabel")} className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/progress?${playerQuery}n=${w}`}
              aria-current={w === n ? "true" : undefined}
              className={cn(
                "flex min-h-9 items-center rounded-md px-3 font-mono text-sm tabular-nums transition-colors",
                w === n
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
              )}
            >
              {w}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-tertiary)]">
        {data.how !== "none" && <span>{t("progress.pickedBy", { how: t(HOW_KEY[data.how]) })}</span>}
        {data.candidates.length > 1 && (
          <details className="group">
            <summary className="cursor-pointer list-none font-medium text-[var(--accent-hover)] hover:underline [&::-webkit-details-marker]:hidden">
              {t("progress.changePlayer")}
            </summary>
            <div className="mt-2">{picker}</div>
          </details>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label={t("progress.tileMatches")} value={String(matches.length)} />
        <SummaryTile
          label={t("progress.tileWins")}
          value={`${view.wins}/${matches.length}`}
          tone={view.wins * 2 >= matches.length ? "text-[var(--good)]" : "text-[var(--text-primary)]"}
        />
        <SummaryTile label={t("progress.tileRating")} value={formatProgressValue(ratingDef, rating.window.value)} highlight />
        <SummaryTile label={t("progress.tileSerious")} value={formatProgressValue(seriousDef, serious.window.value)} />
      </div>

      {matches.length < MIN_TREND_POINTS && (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--text-tertiary)]">
          {t("progress.fewMatches", { n: matches.length, need: MIN_TREND_POINTS })}
        </p>
      )}

      {/* Goals */}
      <section aria-labelledby="cele" className="space-y-3">
        <SectionTitle>
          <span id="cele">{t("progress.goalsTitle")}</span>
        </SectionTitle>
        <GoalsPanel goals={goals} suggestions={suggestions} options={options} window={GOAL_WINDOW} maxGoals={MAX_GOALS} />
      </section>

      {/* Trends */}
      <section aria-labelledby="trendy" className="space-y-3">
        <SectionTitle>
          <span id="trendy">{t("progress.trendsTitle")}</span>
        </SectionTitle>
        <p className="-mt-1 text-xs text-[var(--text-tertiary)]">{t("progress.trendsHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {headline.map((s) => (
            <MetricTrendCard key={s.key} series={s} goal={goalOf.get(s.key) ?? null} />
          ))}
        </div>
        {others.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--accent-hover)] [&::-webkit-details-marker]:hidden">
              <span className="transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {t("progress.moreMetrics")} <span className="font-mono text-xs text-[var(--text-tertiary)]">({others.length})</span>
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {others.map((s) => (
                <MetricTrendCard key={s.key} series={s} goal={goalOf.get(s.key) ?? null} height={90} />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Badges */}
      <section aria-labelledby="odznaki" className="space-y-3">
        <SectionTitle>
          <span id="odznaki">
            {t("progress.badgesTitle")}{" "}
            <span className="font-mono text-sm font-normal text-[var(--text-tertiary)]">
              {t("progress.badgesCount", { n: badges.filter((b) => b.earned).length, total: badges.length })}
            </span>
          </span>
        </SectionTitle>
        <BadgeGrid badges={badges} />
        <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-tertiary)]">
          {user?.publicProfile && user.publicSlug ? (
            <Link href={profilePath(user.publicSlug)} className="inline-flex min-h-10 items-center gap-1.5 font-medium text-[var(--accent-hover)] hover:underline">
              <ExternalLink className="h-4 w-4" aria-hidden />
              {t("progress.publicProfileOpen")}
            </Link>
          ) : (
            <Link href="/settings#profil-publiczny" className="inline-flex min-h-10 items-center hover:text-[var(--text-secondary)] hover:underline">
              {t("progress.publicProfileCta")}
            </Link>
          )}
        </p>
      </section>

      {/* Matches */}
      <section aria-labelledby="mecze" className="space-y-3">
        <SectionTitle>
          <span id="mecze">{t("progress.matchesTitle")}</span>
        </SectionTitle>
        <ul className="space-y-2">
          {[...view.history].reverse().map((h) => (
            <li key={h.matchId}>
              <Link
                href={`/report/${h.matchId}?player=${data.steamId}`}
                className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2.5 transition-colors hover:border-[var(--border-hover)]"
              >
                <MapThumb map={h.map} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                    <span className="truncate">{mapDisplayName(h.map)}</span>
                    <ResultBadge result={h.result} />
                    <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {h.own}:{h.opp}
                    </span>
                  </p>
                  <p className="font-mono text-xs text-[var(--text-tertiary)]">{formatDate(h.date)}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="font-mono text-sm tabular-nums text-[var(--text-primary)]">
                    {formatProgressValue(ratingDef, h.values.rating.value)}
                  </p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">{t("progressMetrics.rating")}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums text-[var(--text-primary)]">
                    {formatProgressValue(seriousDef, h.values.serious.value)}
                  </p>
                  <p className="max-w-[90px] truncate text-[11px] text-[var(--text-tertiary)]">{t("progress.tileSerious")}</p>
                </div>
                <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-label={t("progress.openReport")} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SummaryTile({ label, value, tone, highlight }: { label: string; value: string; tone?: string; highlight?: boolean }) {
  return (
    <Card className="border-t-2 p-4 md:p-4" style={{ borderTopColor: highlight ? "var(--accent-2)" : "var(--accent)" }}>
      <p className="label-overline truncate text-[var(--text-tertiary)]">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", highlight ? "text-[var(--accent-2)]" : tone ?? "text-[var(--text-primary)]")}>
        {value}
      </p>
    </Card>
  );
}
