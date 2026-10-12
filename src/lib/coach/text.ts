/**
 * The coach's prose: what the AI writes (S15) and the standard text built
 * from the catalog when the AI is off, fails or writes something it can't
 * back with a fact. Both have the same shape, so the UI doesn't care which
 * one it shows. Pure, covered by `npm run test:coach`.
 */
import type { Locale } from "@/lib/i18n/config";
import type { TFunction } from "@/lib/i18n/translate";
import { findingCopy } from "./copy";
import type { TrainingPlanContent } from "./plan";

/**
 * Why the text is (or isn't) the AI's: written by it, API off, daily limit,
 * call failed, nothing to write, or not written yet (the page asks for it).
 */
export type CoachStatus = "ai" | "off" | "limit" | "failed" | "none" | "pending";

export interface CoachMatchItem {
  type: string;
  headline: string;
  explanation: string;
  action: string;
}

export interface CoachMatchText {
  summary: string;
  items: CoachMatchItem[];
}

export interface CoachPlanFocusText {
  type: string;
  why: string;
  action: string;
}

export interface CoachPlanText {
  intro: string;
  focus: CoachPlanFocusText[];
}

/** "A, B i C" / "A, B and C". */
export function joinList(items: string[], locale: Locale): string {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")} ${locale === "en" ? "and" : "i"} ${last}`;
}

export function rulesMatchText(types: string[], locale: Locale, t: TFunction): CoachMatchText {
  const items = types.map((type) => {
    const c = findingCopy(type, locale);
    return { type, headline: c.title, explanation: c.why, action: c.advice };
  });
  return {
    summary:
      items.length === 0
        ? t("coach.matchNothing")
        : t("coach.matchRulesSummary", { list: joinList(items.map((i) => i.headline.toLowerCase()), locale) }),
    items,
  };
}

export function rulesPlanText(plan: Pick<TrainingPlanContent, "focuses" | "days">, locale: Locale, t: TFunction): CoachPlanText {
  const focus = plan.focuses.map((f) => {
    const c = findingCopy(f.type, locale);
    return { type: f.type, why: c.why, action: c.advice };
  });
  const drillDays = plan.days.map((d) => d.items.filter((i) => i.kind === "drill").reduce((s, i) => s + i.minutes, 0));
  return {
    intro:
      focus.length === 0
        ? t("coach.rulesIntroNone")
        : t("coach.rulesIntro", {
            list: joinList(plan.focuses.map((f) => findingCopy(f.type, locale).title.toLowerCase()), locale),
            min: Math.min(...drillDays),
            max: Math.max(...drillDays),
          }),
    focus,
  };
}

/**
 * AI text merged over the standard text, item by item: anything the AI left
 * out or got rejected (see grounding.ts) keeps the standard wording.
 */
export function mergeMatchText(rules: CoachMatchText, ai: Partial<CoachMatchText> | null): CoachMatchText {
  if (!ai) return rules;
  const byType = new Map((ai.items ?? []).map((i) => [i.type, i]));
  return {
    summary: ai.summary || rules.summary,
    items: rules.items.map((r) => byType.get(r.type) ?? r),
  };
}

export function mergePlanText(rules: CoachPlanText, ai: Partial<CoachPlanText> | null): CoachPlanText {
  if (!ai) return rules;
  const byType = new Map((ai.focus ?? []).map((f) => [f.type, f]));
  return {
    intro: ai.intro || rules.intro,
    focus: rules.focus.map((r) => byType.get(r.type) ?? r),
  };
}
