import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { EmptyState, SectionTitle, UserAvatar } from "@/components/ui";
import { MapThumb, ResultBadge } from "@/components/match";
import { PublicShell } from "@/components/share/public-shell";
import { MetricTrendCard } from "@/components/charts/lazy-charts";
import { BadgeGrid } from "@/components/progress/badge-grid";
import { loadProgress } from "@/lib/progress/load";
import { buildProgressView } from "@/lib/progress/view";
import { computeBadges } from "@/lib/progress/badges";
import { PROGRESS_WINDOW, formatProgressValue, progressMetric } from "@/lib/progress/metrics";
import { isValidSlug, sharePath } from "@/lib/sharing/share";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Metrics shown on a public profile: results and mechanics, no mistake details. */
const PROFILE_METRICS = ["rating", "adr", "kd", "first_bullet", "moving_first", "crosshair"];
const RECENT = 10;

async function loadUser(slug: string) {
  if (!isValidSlug(slug)) return null;
  return prisma.user.findFirst({
    where: { publicSlug: slug, publicProfile: true },
    select: { id: true, name: true, image: true, steamId: true, faceitNickname: true },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const user = await loadUser(slug);
  const { t } = await getT();
  if (!user) return { title: "CS2 Analyst", robots: { index: false } };
  return { title: `${user.name ?? slug} · ${t("profile.eyebrow")} — CS2 Analyst`, robots: { index: false, follow: false } };
}

/** Public player profile (S16): badges, form and recent matches, opt-in from Settings. */
export default async function PublicProfilePage({ params }: Props) {
  const { slug } = await params;
  const user = await loadUser(slug);
  if (!user) notFound();
  const { t } = await getT();

  const all = await loadProgress(prisma, {
    userId: user.id,
    sessionSteamId: user.steamId,
    faceitNickname: user.faceitNickname,
    limit: 200,
  });
  const matches = all.matches;
  const recent = matches.slice(-PROGRESS_WINDOW);
  const view = buildProgressView(recent);
  const goals = await prisma.goal.findMany({ where: { userId: user.id, achievedAt: { not: null } }, select: { achievedAt: true } });
  const badges = computeBadges(matches, goals.map((g) => g.achievedAt!.toISOString()));
  const shares = all.steamId
    ? await prisma.share.findMany({
        where: { userId: user.id, kind: "report", steamId: all.steamId, revokedAt: null, matchId: { in: recent.map((m) => m.matchId) } },
        select: { matchId: true, token: true },
      })
    : [];
  const shareOf = new Map(shares.map((s) => [s.matchId, s.token]));
  const name = user.name ?? matches[matches.length - 1]?.player.name ?? slug;
  const ratingDef = progressMetric("rating")!;

  return (
    <PublicShell>
      <header className="flex min-w-0 items-center gap-4">
        <UserAvatar name={name} image={user.image} size="lg" />
        <div className="min-w-0">
          <p className="label-overline text-[var(--accent)]">{t("profile.eyebrow")}</p>
          <h1 className="truncate font-display text-2xl font-bold text-[var(--text-primary)] md:text-[28px]">{name}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-mono">{t("profile.analysed", { n: all.playerMatches })}</span>
            {user.faceitNickname && <> · {t("profile.faceit", { nick: user.faceitNickname })}</>}
          </p>
        </div>
      </header>

      {matches.length === 0 ? (
        <EmptyState icon={TrendingUp} title={t("profile.empty")} />
      ) : (
        <>
          <section aria-labelledby="forma" className="space-y-3">
            <SectionTitle>
              <span id="forma">{t("profile.form", { n: recent.length })}</span>
            </SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {view.series
                .filter((s) => PROFILE_METRICS.includes(s.key) && s.hasData)
                .map((s) => (
                  <MetricTrendCard key={s.key} series={s} height={90} />
                ))}
            </div>
          </section>

          <section aria-labelledby="odznaki" className="space-y-3">
            <SectionTitle>
              <span id="odznaki">
                {t("profile.badges")}{" "}
                <span className="font-mono text-sm font-normal text-[var(--text-tertiary)]">
                  {t("progress.badgesCount", { n: badges.filter((b) => b.earned).length, total: badges.length })}
                </span>
              </span>
            </SectionTitle>
            <BadgeGrid badges={badges} />
          </section>

          <section aria-labelledby="ostatnie" className="space-y-3">
            <SectionTitle>
              <span id="ostatnie">{t("profile.recent")}</span>
            </SectionTitle>
            <ul className="space-y-2">
              {[...view.history]
                .reverse()
                .slice(0, RECENT)
                .map((h) => {
                  const token = shareOf.get(h.matchId);
                  return (
                    <li
                      key={h.matchId}
                      className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-2.5"
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
                      <div className="text-right">
                        <p className="font-mono text-sm tabular-nums text-[var(--text-primary)]">
                          {formatProgressValue(ratingDef, h.values.rating.value)}
                        </p>
                        <p className="text-[11px] text-[var(--text-tertiary)]">{t("progressMetrics.rating")}</p>
                      </div>
                      {token && (
                        <Link
                          href={sharePath(token)}
                          className="flex min-h-10 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-[var(--accent-hover)] hover:bg-[var(--surface-2)]"
                        >
                          {t("profile.report")}
                        </Link>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        </>
      )}
    </PublicShell>
  );
}
