"use client";

import { useState } from "react";
import Link from "next/link";
import { Dumbbell, ExternalLink, Gamepad2, Lightbulb, Play, Sparkles, Target, TrendingUp, Eye } from "lucide-react";
import { Button, Card, Checkbox, SectionTitle, buttonVariants, useToast } from "@/components/ui";
import { metricLabel } from "@/lib/progress/labels";
import { findingCopy } from "@/lib/coach/copy";
import { DRILLS, drillText, workshopUrl, type DrillId } from "@/lib/coach/drills";
import type { PlanDay, PlanFocus, TrainingPlanContent } from "@/lib/coach/plan";
import type { CoachPlanText, CoachStatus } from "@/lib/coach/text";
import { replayHref } from "@/lib/findings/view";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { formatProgressValue } from "@/lib/progress/format";
import { cn } from "@/lib/utils/cn";
import { mapDisplayName } from "@/lib/utils/mapNames";
import { CoachSource } from "./coach-source";
import { FeedbackButtons } from "./feedback-buttons";
import { useCoachText } from "./use-coach-text";

export function CoachPlan({
  planId,
  plan,
  mapName,
  initial,
  ratings,
  doneDays,
  aiEnabled,
}: {
  planId: string;
  plan: TrainingPlanContent;
  /** Display name of the player's main map, for map drills. */
  mapName: string | null;
  initial: { text: CoachPlanText; status: CoachStatus };
  ratings: Record<string, boolean>;
  doneDays: number[];
  aiEnabled: boolean;
}) {
  const t = useT();
  const toast = useToast();
  const { text, status, writing, rewrite } = useCoachText("/api/coach/plan", { planId }, initial, aiEnabled);
  const [savingGoals, setSavingGoals] = useState(false);
  const withTargets = plan.focuses.filter((f) => f.metric);

  async function setGoals() {
    setSavingGoals(true);
    let failed = 0;
    for (const f of withTargets) {
      const res = await fetch("/api/progress/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric: f.metric!.metric, target: f.metric!.target }),
      }).catch(() => null);
      if (!res?.ok) failed++;
    }
    setSavingGoals(false);
    toast(
      failed === 0
        ? { title: t("coach.goalsSet"), variant: "success" }
        : { title: t("coach.goalsFailed"), variant: "error" }
    );
  }

  const focusText = new Map(text.focus.map((f) => [f.type, f]));

  return (
    <div className="space-y-8">
      <Card className="space-y-4 border-[var(--border-active)]">
        <CoachSource status={status} writing={writing || status === "pending"} aiEnabled={aiEnabled} onRewrite={rewrite} />
        <p className="text-base leading-relaxed text-[var(--text-primary)]">{text.intro}</p>
        {withTargets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="cta" onClick={setGoals} disabled={savingGoals}>
              <Target className="h-4 w-4" aria-hidden />
              {savingGoals ? t("common.saving") : t("coach.setGoals")}
            </Button>
            <Link href="/progress" className={buttonVariants({ variant: "secondary" })}>
              <TrendingUp className="h-4 w-4" aria-hidden />
              {t("nav.progress")}
            </Link>
          </div>
        )}
      </Card>

      {plan.focuses.length > 0 && (
        <section aria-labelledby="coach-focus" className="space-y-4">
          <SectionTitle>
            <span id="coach-focus">{t("coach.focusTitle")}</span>
          </SectionTitle>
          {plan.focuses.map((f, i) => (
            <FocusCard
              key={f.type}
              rank={i + 1}
              focus={f}
              why={focusText.get(f.type)?.why ?? ""}
              action={focusText.get(f.type)?.action ?? ""}
              mapName={mapName}
              context={`plan:${plan.weekStart}`}
              rating={ratings[f.type] ?? null}
            />
          ))}
        </section>
      )}

      <Week planId={planId} days={plan.days} focuses={plan.focuses} mapName={mapName} initialDone={doneDays} />
    </div>
  );
}

function FocusCard({
  rank,
  focus: f,
  why,
  action,
  mapName,
  context,
  rating,
}: {
  rank: number;
  focus: PlanFocus;
  why: string;
  action: string;
  mapName: string | null;
  context: string;
  rating: boolean | null;
}) {
  const t = useT();
  const locale = useLocale();
  const copy = findingCopy(f.type, locale);
  const m = f.metric;
  return (
    <Card
      className="space-y-4 border-l-4"
      style={{ borderLeftColor: rank === 1 ? "var(--accent-2)" : "var(--accent)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-display text-base font-bold",
            rank === 1 ? "bg-[var(--accent-2)] text-[var(--on-accent)]" : "bg-[var(--accent-muted)] text-[var(--accent-hover)]"
          )}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-overline text-[var(--text-tertiary)]">{t("coach.focusRank", { n: rank })}</p>
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">{copy.title}</h3>
        </div>
        <FeedbackButtons type={f.type} context={context} initial={rating} />
      </div>

      {m && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-[var(--surface-2)] p-3">
            <p className="text-xs text-[var(--text-tertiary)]">{t("coach.now")}</p>
            <p className="font-mono text-lg font-semibold text-[var(--text-primary)]">{formatProgressValue(m, m.current)}</p>
            <p className="truncate text-xs text-[var(--text-tertiary)]">{metricLabel(t, m.metric)}</p>
          </div>
          <div className="rounded-lg bg-[var(--accent-2-muted)] p-3">
            <p className="text-xs text-[var(--text-tertiary)]">{t("coach.weekTarget")}</p>
            <p className="font-mono text-lg font-semibold text-[var(--accent-2)]">
              {m.direction === "lower" ? "≤ " : "≥ "}
              {formatProgressValue(m, m.target)}
            </p>
            {m.goal != null && m.goal !== m.target && (
              <p className="text-xs text-[var(--text-tertiary)]">
                {t("coach.finalGoal", { value: formatProgressValue(m, m.goal) })}
              </p>
            )}
          </div>
          <div className="col-span-2 rounded-lg bg-[var(--surface-2)] p-3 sm:col-span-1">
            <p className="text-xs text-[var(--text-tertiary)]">{t("coach.proRef")}</p>
            <p className="text-sm text-[var(--text-secondary)]">{copy.pro.replace(/^pro:\s*/i, "")}</p>
          </div>
        </div>
      )}
      {f.moments.total > 0 && (
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="">
            {t("coach.momentsLine", {
              total: f.moments.total,
              matches: f.moments.matches,
              perMatch: f.moments.perMatch,
              target: f.moments.target,
            })}
          </span>
        </p>
      )}

      {why && (
        <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hover)]" aria-hidden />
          <span>
            <span className="font-semibold text-[var(--text-primary)]">{t("coach.why")}: </span>
            {why}
          </span>
        </p>
      )}
      {action && (
        <div className="rounded-lg bg-[var(--accent-muted)] p-3">
          <p className="flex items-start gap-2 text-sm text-[var(--text-primary)]">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-2)]" aria-hidden />
            <span>
              <span className="font-semibold">{t("coach.action")}: </span>
              {action}
            </span>
          </p>
        </div>
      )}

      {f.drills.length > 0 && (
        <div className="space-y-2">
          <p className="label-overline text-[var(--text-tertiary)]">{t("coach.drills")}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {f.drills.map((d) => (
              <DrillCard key={d} id={d} mapName={mapName} />
            ))}
          </div>
        </div>
      )}

      {f.examples.length > 0 && (
        <div className="space-y-2">
          <p className="label-overline text-[var(--text-tertiary)]">{t("coach.examples")}</p>
          <div className="flex flex-wrap gap-2">
            {f.examples.map((e) => (
              <Link key={e.id} href={replayHref(e.matchId, e)} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                {t("coach.exampleRound", { map: mapDisplayName(e.map), n: e.roundNumber })}
              </Link>
            ))}
            <Link
              href={`/report/${f.examples[0].matchId}?player=${f.examples[0].steamId}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {t("nav.report")}
            </Link>
          </div>
        </div>
      )}
    </Card>
  );
}

function DrillCard({ id, mapName }: { id: DrillId; mapName: string | null }) {
  const t = useT();
  const locale = useLocale();
  const def = DRILLS[id];
  const tx = drillText(id, locale, mapName);
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="flex items-start gap-2">
        <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hover)]" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{tx.name}</p>
        <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">{t("coach.minutes", { n: def.minutes })}</span>
      </div>
      <p className="text-sm text-[var(--text-secondary)]">{tx.how}</p>
      <p className="text-xs text-[var(--text-tertiary)]">
        <span className="font-semibold">{t("coach.measure")}: </span>
        {tx.measure}
      </p>
      <div className="mt-auto pt-1">
        {def.where === "workshop" && tx.workshop ? (
          <a
            href={workshopUrl(tx.workshop)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {t("coach.findWorkshop")}
          </a>
        ) : def.where === "app" && def.appPath ? (
          <Link href={def.appPath} className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2" })}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {t("coach.openScreen")}
          </Link>
        ) : (
          <span className="text-xs text-[var(--text-tertiary)]">
            {id === "nade_practice" || id === "flash_practice" ? t("coach.privateServer") : t("coach.communityServer")}
          </span>
        )}
      </div>
    </div>
  );
}

function Week({
  planId,
  days,
  focuses,
  mapName,
  initialDone,
}: {
  planId: string;
  days: PlanDay[];
  focuses: PlanFocus[];
  mapName: string | null;
  initialDone: number[];
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [done, setDone] = useState(new Set(initialDone));
  const title = (type: string | null) => (type ? findingCopy(type, locale).title : "");

  async function toggle(day: number, value: boolean) {
    const prev = new Set(done);
    const next = new Set(done);
    if (value) next.add(day);
    else next.delete(day);
    setDone(next);
    const res = await fetch("/api/coach/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, day, done: value }),
    }).catch(() => null);
    if (!res?.ok) {
      setDone(prev);
      toast({ title: t("common.error"), variant: "error" });
    }
  }

  return (
    <section aria-labelledby="coach-week" className="space-y-3">
      <SectionTitle
        action={
          <span className="font-mono text-sm text-[var(--text-tertiary)]">
            {t("coach.daysDone", { done: done.size, total: days.length })}
          </span>
        }
      >
        <span id="coach-week">{t("coach.weekTitle")}</span>
      </SectionTitle>
      <p className="text-sm text-[var(--text-tertiary)]">{t("coach.weekHint")}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {days.map((d) => {
          const isDone = done.has(d.day);
          return (
            <Card key={d.day} className={cn("space-y-3 p-4 md:p-4", isDone && "border-[var(--good)] opacity-80")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  {t(`coach.day${d.day}` as MessageKey)}
                </h3>
                <span className="font-mono text-xs text-[var(--text-tertiary)]">{t("coach.minutes", { n: d.minutes })}</span>
              </div>
              <ul className="space-y-2">
                {d.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    {item.kind === "drill" ? (
                      <Dumbbell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-hover)]" aria-hidden />
                    ) : item.kind === "match" ? (
                      <Gamepad2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-2)]" aria-hidden />
                    ) : (
                      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--info)]" aria-hidden />
                    )}
                    <span className="min-w-0">
                      {item.kind === "drill" ? (
                        <>
                          {item.focus ? null : <span className="text-[var(--text-tertiary)]">{t("coach.warmup")}: </span>}
                          {drillText(item.drill, locale, mapName).name}
                          {item.focus && <span className="block text-xs text-[var(--text-tertiary)]">{title(item.focus)}</span>}
                        </>
                      ) : item.kind === "match" ? (
                        item.focus && focuses.some((f) => f.type === item.focus) ? (
                          t("coach.itemMatch", { focus: title(item.focus) })
                        ) : (
                          t("coach.itemMatchFree")
                        )
                      ) : (
                        t("coach.itemReview")
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <Checkbox
                id={`coach-day-${d.day}`}
                checked={isDone}
                onChange={(e) => toggle(d.day, e.target.checked)}
                label={t("coach.dayDone")}
              />
            </Card>
          );
        })}
      </div>
    </section>
  );
}
