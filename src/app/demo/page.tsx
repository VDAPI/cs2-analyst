import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, Eye } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { PublicShell } from "@/components/share/public-shell";
import { RoleCard } from "@/components/roles/role-card";
import { ReportTour } from "@/components/onboarding/report-tour";
import { getFindings } from "@/lib/findings/persist";
import { loadPlayerReport, reportClipContext } from "@/lib/findings/player-report";
import { toFindingView } from "@/lib/findings/view";
import { getDemoMatchId } from "@/lib/demo/demo-match";
import { loadReportNorms } from "@/lib/norms/report-norms";
import { loadReportRole } from "@/lib/roles/report-role";
import { loadReportWinProb } from "@/lib/winprob/report";
import { cn } from "@/lib/utils/cn";
import { ReportBody } from "@/app/(dashboard)/report/[matchId]/report-body";

// The example can change (admin pick, new pro demo): never prerendered.
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ player?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: t("onboarding.demo.metaTitle"),
    description: t("onboarding.demo.metaDescription"),
  };
}

/**
 * The public example analysis (S21): the full report of one match (an admin
 * pick or the newest pro demo) for anyone, without an account. Read-only like
 * a share link; clips read the match's replay data through `getMatchAccess`.
 */
export default async function DemoPage({ searchParams }: Props) {
  const { player } = await searchParams;
  const { t, locale } = await getT();
  const matchId = await getDemoMatchId(prisma);
  const match = matchId
    ? await prisma.match.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          map: true,
          scoreCT: true,
          scoreT: true,
          players: { select: { steamId: true, name: true, team: true } },
          upload: { select: { pro: true, proLabel: true } },
        },
      })
    : null;

  if (!match) {
    return (
      <PublicShell>
        <PageHeader eyebrow={t("onboarding.demo.eyebrow")} title={t("onboarding.demo.title")} />
        <EmptyState
          icon={ClipboardCheck}
          title={t("onboarding.demo.emptyTitle")}
          description={t("onboarding.demo.emptyBody")}
        />
      </PublicShell>
    );
  }

  const all = (await getFindings(prisma, match.id)).map(toFindingView);
  const nameOf = new Map(match.players.map((p) => [p.steamId, p.name]));
  const players = [...match.players].sort((a, b) =>
    a.team === b.team ? a.name.localeCompare(b.name) : a.team === "CT" ? -1 : 1
  );
  const countOf = new Map<string, number>();
  for (const f of all) if (f.severity !== "low") countOf.set(f.steamId, (countOf.get(f.steamId) ?? 0) + 1);
  // By default the player with the most to fix: the fullest example of a report.
  const selected =
    players.find((p) => p.steamId === player) ??
    [...players].sort((a, b) => (countOf.get(b.steamId) ?? 0) - (countOf.get(a.steamId) ?? 0))[0];

  const loaded = selected ? await loadPlayerReport(prisma, match.id, selected.steamId, all) : null;
  const hasData = Boolean(selected && loaded?.hasData);
  const [norms, role, winprob] =
    selected && loaded && hasData
      ? await Promise.all([
          loadReportNorms(prisma, {
            matchId: match.id,
            steamId: selected.steamId,
            map: match.map,
            metrics: loaded.metrics,
            rounds: loaded.rounds,
            t,
          }),
          loadReportRole(prisma, { matchId: match.id, steamId: selected.steamId, map: match.map }),
          loadReportWinProb(prisma, match.id, selected.steamId, t, locale),
        ])
      : [null, null, null];
  const ctx = reportClipContext(match.id, match.map, null, true);
  const score = `${match.scoreCT}:${match.scoreT}`;

  return (
    <PublicShell>
      <PageHeader
        eyebrow={t("onboarding.demo.eyebrow")}
        title={t("onboarding.demo.title")}
        description={
          <>
            {t("onboarding.demo.description", { map: ctx.mapName, score })}
            {match.upload?.pro && (
              <>
                {" "}
                <span className="text-[var(--text-tertiary)]">
                  ({match.upload.proLabel ?? t("onboarding.demo.proMatch")})
                </span>
              </>
            )}
          </>
        }
        actions={hasData ? <ReportTour context="demo" autoStart persist={false} /> : undefined}
      />

      <p className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 text-sm text-[var(--text-secondary)]">
        <Eye className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        {t("onboarding.demo.readOnly")}
      </p>

      <nav aria-label={t("onboarding.demo.pick")} data-tour="player" className="-mx-4 md:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0">
          {players.map((p) => {
            const active = p.steamId === selected?.steamId;
            return (
              <Link
                key={p.steamId}
                href={`/demo?player=${p.steamId}`}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                  active
                    ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: p.team === "CT" ? "var(--ct-blue)" : "var(--t-gold)" }}
                  aria-hidden
                />
                <span className="max-w-[140px] truncate">{p.name}</span>
                <span className="font-mono text-xs text-[var(--text-tertiary)]">{countOf.get(p.steamId) ?? 0}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {hasData && loaded ? (
        <div className="min-w-0 space-y-8">
          {role && <RoleCard data={role} mapName={ctx.mapName} compareHref={null} t={t} />}
          <ReportBody report={loaded.report} ctx={ctx} nameOf={nameOf} norms={norms} winprob={winprob} />
        </div>
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          title={t("onboarding.demo.noData")}
          action={
            <Link href="/register" className={buttonVariants({ variant: "cta" })}>
              {t("shared.ctaButton")}
            </Link>
          }
        />
      )}
    </PublicShell>
  );
}
