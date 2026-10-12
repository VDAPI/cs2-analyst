import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Dumbbell, GraduationCap } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import { Card, EmptyState, PageHeader, buttonVariants } from "@/components/ui";
import { CoachPlan } from "@/components/coach/coach-plan";
import { coachAiEnabled } from "@/lib/coach/ai";
import { PLAN_WINDOW } from "@/lib/coach/plan";
import { loadRatings, planCoachText, upsertWeeklyPlan } from "@/lib/coach/persist";
import { loadProgress } from "@/lib/progress/load";
import { formatDate } from "@/lib/utils/formatters";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { StartActions } from "@/components/onboarding/getting-started";

interface Props {
  searchParams: Promise<{ player?: string }>;
}

/** The AI coach (S15): this week's training plan from the player's latest matches. */
export default async function CoachPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const query = await searchParams;
  const { t, locale } = await getT();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true, faceitNickname: true } });
  const data = await loadProgress(prisma, {
    userId,
    requested: query.player,
    sessionSteamId: user?.steamId,
    faceitNickname: user?.faceitNickname,
    limit: PLAN_WINDOW,
  });

  const header = (description: React.ReactNode) => (
    <PageHeader
      eyebrow={t("coach.eyebrow")}
      title={t("coach.title")}
      description={description}
      actions={
        data.matches.length > 0 ? (
          <Link
            href={data.steamId ? `/training?player=${data.steamId}` : "/training"}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            <Dumbbell className="h-3.5 w-3.5" aria-hidden />
            {t("training.title")}
          </Link>
        ) : null
      }
    />
  );

  if (data.totalMatches === 0) {
    return (
      <div className="space-y-6">
        {header(t("coach.description"))}
        <EmptyState
          icon={GraduationCap}
          title={t("coach.emptyTitle")}
          description={t("coach.emptyBody")}
          action={<StartActions />}
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
            href={`/coach?player=${c.steamId}`}
            aria-current={c.steamId === data.steamId ? "true" : undefined}
            className={cn(
              "flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
              c.steamId === data.steamId
                ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
            )}
          >
            <span className="min-w-0 truncate">{c.name}</span>
            <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{t("progress.playerMatches", { n: c.matches })}</span>
          </Link>
        ))}
      </div>
    </Card>
  );

  if (!data.steamId || data.matches.length === 0) {
    return (
      <div className="space-y-6">
        {header(t("coach.description"))}
        {picker}
      </div>
    );
  }

  const { row, content } = await upsertWeeklyPlan(prisma, { userId, steamId: data.steamId, matches: data.matches });
  const [initial, ratings] = await Promise.all([
    planCoachText(prisma, { userId, row, content, locale, cacheOnly: true }),
    loadRatings(prisma, userId, `plan:${content.weekStart}`),
  ]);
  const mapName = content.map ? mapDisplayName(content.map) : null;

  return (
    <div className="min-w-0 space-y-6">
      {header(
        <>
          <span className="font-medium text-[var(--text-secondary)]">
            {t("coach.weekOf", { date: formatDate(`${content.weekStart}T12:00:00Z`) })}
          </span>{" "}
          ·{" "}
          {t("coach.basedOn", {
            name: content.player ?? "",
            n: content.matches,
            from: content.firstDate ? formatDate(content.firstDate) : "–",
            to: content.lastDate ? formatDate(content.lastDate) : "–",
          })}
        </>
      )}
      {data.candidates.length > 1 && (
        <details className="group text-xs text-[var(--text-tertiary)]">
          <summary className="cursor-pointer list-none font-medium text-[var(--accent-hover)] hover:underline [&::-webkit-details-marker]:hidden">
            {t("progress.changePlayer")}
          </summary>
          <div className="mt-3">{picker}</div>
        </details>
      )}
      <CoachPlan
        planId={row.id}
        plan={content}
        mapName={mapName}
        initial={initial}
        ratings={ratings}
        doneDays={row.doneDays}
        aiEnabled={coachAiEnabled()}
      />
    </div>
  );
}
