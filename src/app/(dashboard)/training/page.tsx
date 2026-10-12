import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Download, Dumbbell, ExternalLink, Eye, Gamepad2, GraduationCap, Target } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getT } from "@/lib/i18n/server";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { Badge, Card, EmptyState, PageHeader, SectionTitle, buttonVariants } from "@/components/ui";
import { LineupCard } from "@/components/lineups/lineup-card";
import { PLAN_WINDOW } from "@/lib/coach/plan";
import { upsertWeeklyPlan } from "@/lib/coach/persist";
import { loadProgress } from "@/lib/progress/load";
import { cfgFileName, execName } from "@/lib/training/cfg";
import { loadRoutineLineups } from "@/lib/training/persist";
import { buildRoutine, planDayOf, type RoutineItem } from "@/lib/training/routine";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { cn } from "@/lib/utils/cn";
import { DayDone } from "./day-done";
import { StartActions } from "@/components/onboarding/getting-started";

interface Props {
  searchParams: Promise<{ day?: string; player?: string }>;
}

const WHERE_KEY: Record<RoutineItem["where"], MessageKey> = {
  workshop: "training.whereWorkshop",
  server: "training.whereServer",
  app: "training.whereApp",
  match: "training.whereMatch",
};

/**
 * Daily routine (S22): one day of the weekly plan with the exact Workshop
 * maps, minutes and numbers to hit, the day's lineups and a .cfg to exec.
 */
export default async function TrainingPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const query = await searchParams;
  const { t, locale } = await getT();

  const header = (
    <PageHeader
      eyebrow={t("training.eyebrow")}
      title={t("training.title")}
      description={t("training.description")}
      actions={
        <Link href="/coach" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <GraduationCap className="h-3.5 w-3.5" aria-hidden />
          {t("training.openPlan")}
        </Link>
      }
    />
  );

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { steamId: true, faceitNickname: true } });
  const data = await loadProgress(prisma, {
    userId,
    requested: query.player,
    sessionSteamId: user?.steamId,
    faceitNickname: user?.faceitNickname,
    limit: PLAN_WINDOW,
  });
  if (!data.steamId && data.candidates.length > 0) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="space-y-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">{t("progress.pickPlayer")}</h2>
            <p className="mt-1 text-sm text-[var(--text-tertiary)]">{t("progress.pickPlayerHint")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.candidates.map((c) => (
              <Link
                key={c.steamId}
                href={`/training?player=${c.steamId}`}
                className="flex min-h-10 max-w-full items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
              >
                <span className="min-w-0 truncate">{c.name}</span>
                <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{t("progress.playerMatches", { n: c.matches })}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    );
  }
  if (!data.steamId || data.matches.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Dumbbell}
          title={t("coach.emptyTitle")}
          description={t("coach.emptyBody")}
          action={
            data.totalMatches === 0 ? (
              <StartActions />
            ) : (
              <Link href="/coach" className={buttonVariants({ variant: "primary" })}>
                {t("training.openPlan")}
              </Link>
            )
          }
        />
      </div>
    );
  }

  const { row, content } = await upsertWeeklyPlan(prisma, { userId, steamId: data.steamId, matches: data.matches });
  const today = planDayOf(new Date());
  const asked = Number(query.day);
  const day = query.day != null && Number.isInteger(asked) && asked >= 0 && asked <= 6 ? asked : today;
  const mapName = content.map ? mapDisplayName(content.map) : null;
  const routine = buildRoutine(content, day, locale, mapName, t);
  const lineups = await loadRoutineLineups(prisma, userId, content.map, routine);
  const cfgFile = cfgFileName("routine");
  const playerQ = query.player ? `&player=${encodeURIComponent(query.player)}` : "";

  return (
    <div className="min-w-0 space-y-6">
      {header}

      <nav aria-label={t("training.title")} className="-mx-4 md:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 md:flex-wrap md:overflow-visible md:px-0">
          {content.days.map((d) => (
            <Link
              key={d.day}
              href={`/training?day=${d.day}${playerQ}`}
              scroll={false}
              aria-current={d.day === day ? "true" : undefined}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
                d.day === day
                  ? "border-[var(--border-active)] bg-[var(--accent-muted)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--text-primary)]"
              )}
            >
              {t(`coach.day${d.day}` as MessageKey)}
              {d.day === today && <Badge variant="lime">{t("training.today")}</Badge>}
              {row.doneDays.includes(d.day) && <span className="text-[var(--good)]" aria-hidden>✓</span>}
            </Link>
          ))}
        </div>
      </nav>

      <Card className="flex min-w-0 flex-col gap-4 border-[var(--border-active)] md:flex-row md:items-center">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
            {t(`coach.day${day}` as MessageKey)}
            {day === today && <span className="text-[var(--accent-2)]"> · {t("training.today")}</span>}
          </h2>
          <p className="font-mono text-sm text-[var(--text-secondary)]">{t("training.total", { n: routine.minutes })}</p>
          <DayDone key={`${row.id}-${day}`} planId={row.id} day={day} initial={row.doneDays.includes(day)} />
        </div>
        {routine.items.length > 0 && (
          <div className="min-w-0 space-y-2 md:max-w-sm">
            <a
              href={`/api/training/cfg?kind=routine&day=${day}`}
              download={cfgFile}
              className={buttonVariants({ variant: "cta", className: "w-full md:w-auto" })}
            >
              <Download className="h-4 w-4" aria-hidden />
              {t("training.downloadCfg")}
            </a>
            <p className="text-xs text-[var(--text-tertiary)]">{t("training.cfgHint", { exec: execName(cfgFile) })}</p>
          </div>
        )}
      </Card>

      {routine.items.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--text-secondary)]">{t("training.restDay")}</p>
        </Card>
      ) : (
        <ol className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
          {routine.items.map((item, i) => (
            <RoutineCard key={i} item={item} index={i} t={t} />
          ))}
        </ol>
      )}

      <section aria-labelledby="routine-lineups" className="min-w-0 space-y-3">
        <SectionTitle
          action={
            <Link
              href={content.map ? `/lineups?map=${content.map}&show=todo` : "/lineups"}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Target className="h-3.5 w-3.5" aria-hidden />
              {t("training.openTrainer")}
            </Link>
          }
        >
          <span id="routine-lineups">{t("training.lineupsTitle")}</span>
        </SectionTitle>
        {lineups.length === 0 || !content.map ? (
          <p className="text-sm text-[var(--text-tertiary)]">{t("training.lineupsEmpty")}</p>
        ) : (
          <>
            <p className="text-sm text-[var(--text-tertiary)]">{t("training.lineupsHint", { map: mapName ?? "" })}</p>
            <ol className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lineups.map((l, i) => (
                <LineupCard key={l.key} lineup={l} index={i} map={content.map!} mastered={false} t={t} />
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}

function RoutineCard({ item, index, t }: { item: RoutineItem; index: number; t: TFunction }) {
  const Icon = item.kind === "match" ? Gamepad2 : item.kind === "review" ? Eye : Dumbbell;
  return (
    <li className="min-w-0">
      <Card className="flex h-full min-w-0 flex-col gap-3 p-4 md:p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] font-mono text-sm font-bold text-[var(--accent-hover)]">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-overline text-[var(--text-tertiary)]">
              {item.warmup ? t("training.warmup") : item.focusTitle ?? t(WHERE_KEY[item.where])}
            </p>
            <h3 className="break-words font-display text-base font-semibold text-[var(--text-primary)]">{item.name}</h3>
          </div>
          <span className="shrink-0 font-mono text-sm text-[var(--text-secondary)]">{t("coach.minutes", { n: item.minutes })}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="neutral">
            <Icon className="mr-1 h-3 w-3" aria-hidden />
            {t(WHERE_KEY[item.where])}
          </Badge>
          {item.workshop && <Badge variant="default">{item.workshop}</Badge>}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{item.how}</p>
        <p className="rounded-lg bg-[var(--accent-2-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
          <span className="font-semibold text-[var(--accent-2)]">{t("training.target")}: </span>
          {item.target}
        </p>
        {(item.workshopUrl || item.appPath) && (
          <div className="mt-auto">
            {item.workshopUrl ? (
              <a
                href={item.workshopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t("coach.findWorkshop")}
              </a>
            ) : (
              <Link href={item.appPath!} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t("coach.openScreen")}
              </Link>
            )}
          </div>
        )}
      </Card>
    </li>
  );
}
