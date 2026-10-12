/**
 * Daily routine (S22): one day of the weekly plan (S15) turned into a list a
 * player can follow with the game open — the concrete Workshop map or server,
 * the minutes, and a number to hit — plus the lineups to practise that day.
 * The plan decides the drills and the targets; this module only picks the
 * day and spells it out. Pure, covered by `npm run test:training`.
 */
import { DRILLS, drillText, workshopUrl, type DrillId } from "@/lib/coach/drills";
import { findingCopy } from "@/lib/coach/copy";
import type { PlanDay, PlanFocus, TrainingPlanContent } from "@/lib/coach/plan";
import type { Locale } from "@/lib/i18n/config";
import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import { formatProgressValue } from "@/lib/progress/format";

export interface RoutineItem {
  kind: "drill" | "match" | "review";
  drill: DrillId | null;
  /** Warm-up drills open every day and train no focus. */
  warmup: boolean;
  name: string;
  how: string;
  /** The number to hit (drill measure, or the focus' target for a match). */
  target: string;
  minutes: number;
  where: "workshop" | "server" | "app" | "match";
  /** Workshop map name and its Workshop search link. */
  workshop: string | null;
  workshopUrl: string | null;
  appPath: string | null;
  focus: string | null;
  focusTitle: string | null;
}

export interface Routine {
  day: number;
  minutes: number;
  items: RoutineItem[];
  /** Grenade types the day trains, for picking today's lineups. */
  lineupTypes: Array<"SMOKE" | "FLASH" | "MOLOTOV" | "HE">;
}

/** Drills that mean throwing grenades on a private server: the day gets lineups. */
const NADE_DRILLS: Partial<Record<DrillId, Routine["lineupTypes"]>> = {
  lineups: ["SMOKE", "MOLOTOV"],
  nade_practice: ["MOLOTOV", "HE", "SMOKE"],
  flash_practice: ["FLASH"],
};

/** Weekday in Europe/Warsaw, 0 = Monday (the plan's day index). */
export function planDayOf(date: Date): number {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short" }).format(date);
  return Math.max(0, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd));
}

/** The focus' targets as one line: "≤ 0.4 momentów „Smoke za wcześnie” na mecz · Ruch przy strzale ≤ 12%". */
export function focusTargetLine(f: PlanFocus, locale: Locale, t: TFunction): string {
  const title = findingCopy(f.type, locale).title;
  const parts = [t("training.matchMoments", { target: f.moments.target, now: f.moments.perMatch, focus: title })];
  if (f.metric) {
    const m = f.metric;
    parts.push(
      `${t(`progressMetrics.${m.metric}` as MessageKey)} ${m.direction === "lower" ? "≤" : "≥"} ${formatProgressValue(m, m.target)}`
    );
  }
  return parts.join(" · ");
}

export function buildRoutine(
  plan: Pick<TrainingPlanContent, "days" | "focuses">,
  day: number,
  locale: Locale,
  mapName: string | null,
  t: TFunction
): Routine {
  const d: PlanDay | undefined = plan.days.find((x) => x.day === day);
  const focusOf = new Map(plan.focuses.map((f) => [f.type, f]));
  const items: RoutineItem[] = [];
  const types = new Set<Routine["lineupTypes"][number]>();

  for (const item of d?.items ?? []) {
    const focus = item.focus ? focusOf.get(item.focus) ?? null : null;
    const focusTitle = item.focus ? findingCopy(item.focus, locale).title : null;
    if (item.kind === "drill") {
      const def = DRILLS[item.drill];
      const tx = drillText(item.drill, locale, mapName);
      for (const ty of NADE_DRILLS[item.drill] ?? []) types.add(ty);
      items.push({
        kind: "drill",
        drill: item.drill,
        warmup: !item.focus,
        name: tx.name,
        how: tx.how,
        target: tx.measure,
        minutes: item.minutes,
        where: def.where,
        workshop: def.where === "workshop" ? tx.workshop ?? null : null,
        workshopUrl: def.where === "workshop" && tx.workshop ? workshopUrl(tx.workshop) : null,
        appPath: def.where === "app" ? def.appPath ?? null : null,
        focus: item.focus,
        focusTitle,
      });
    } else if (item.kind === "match") {
      items.push({
        kind: "match",
        drill: null,
        warmup: false,
        name: focusTitle ? t("coach.itemMatch", { focus: focusTitle }) : t("coach.itemMatchFree"),
        how: focus ? findingCopy(focus.type, locale).advice : t("training.matchFreeHow"),
        target: focus ? focusTargetLine(focus, locale, t) : t("training.matchFreeTarget"),
        minutes: item.minutes,
        where: "match",
        workshop: null,
        workshopUrl: null,
        appPath: null,
        focus: item.focus,
        focusTitle,
      });
    } else {
      items.push({
        kind: "review",
        drill: null,
        warmup: false,
        name: t("coach.itemReview"),
        how: t("training.reviewHow"),
        target: t("training.reviewTarget"),
        minutes: item.minutes,
        where: "app",
        workshop: null,
        workshopUrl: null,
        appPath: "/progress",
        focus: null,
        focusTitle: null,
      });
    }
  }
  // Utility focuses always practise lineups, even on a day without a grenade drill.
  for (const f of plan.focuses) {
    if (f.category === "utility" && items.some((i) => i.focus === f.type)) {
      types.add("SMOKE");
      types.add("MOLOTOV");
    }
  }
  return {
    day,
    minutes: items.reduce((s, i) => s + i.minutes, 0),
    items,
    lineupTypes: (["SMOKE", "MOLOTOV", "FLASH", "HE"] as const).filter((ty) => types.has(ty)),
  };
}
