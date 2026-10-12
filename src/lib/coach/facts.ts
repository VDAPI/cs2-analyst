/**
 * The facts the AI coach writes from (S15): plain JSON holding only what the
 * analysis measured (findings, their numbers, report metrics, the plan's
 * targets and drills) plus the catalog's standard advice. Nothing else goes
 * to the model, and grounding.ts checks the reply against these same facts.
 * Pure, covered by `npm run test:coach`.
 */
import { formatMetric, type ReportIssue, type ReportMetric } from "@/lib/findings/report";
import { fmtFindingValue, fmtRoundTime, type FindingView } from "@/lib/findings/view";
import type { Locale } from "@/lib/i18n/config";
import { formatProgressValue } from "@/lib/progress/format";
import { categoryLabel, findingCopy } from "./copy";
import { drillText } from "./drills";
import type { TrainingPlanContent } from "./plan";

const EXAMPLES = 3;

export interface MatchFactsInput {
  locale: Locale;
  map: string;
  playerName: string;
  /** Rounds won by the player's team, lost, and the result. */
  score: { own: number; opp: number };
  rounds: number;
  issues: ReportIssue<FindingView>[];
  strengths: ReportMetric[];
}

function metricFact(m: ReportMetric | null) {
  if (!m || m.status === "none") return null;
  return { name: m.label, value: formatMetric(m), threshold: m.threshold, judged: m.status, samples: m.samples, detail: m.hint };
}

export function matchFacts(input: MatchFactsInput) {
  const { locale } = input;
  return {
    language: locale === "en" ? "English" : "Polish",
    match: {
      map: input.map,
      player: input.playerName,
      score: `${input.score.own}:${input.score.opp}`,
      result: input.score.own > input.score.opp ? "win" : input.score.own < input.score.opp ? "loss" : "draw",
      rounds: input.rounds,
    },
    issues: input.issues.map((i) => {
      const c = findingCopy(i.type, locale);
      return {
        type: i.type,
        title: c.title,
        category: categoryLabel(i.def.category, locale),
        severity: i.severity,
        why_it_costs_rounds: c.why,
        standard_advice: c.advice,
        drill: c.drill,
        pro_reference: c.pro,
        moments: { total: i.findings.length, serious: i.high, to_improve: i.medium, hints: i.low, lost_the_fight: i.costly },
        match_metric: metricFact(i.metric),
        examples: i.findings.slice(0, EXAMPLES).map((f) => ({
          round: f.roundNumber,
          time_in_round: fmtRoundTime(f.roundTime),
          severity: f.severity,
          lost_the_fight: f.costly,
          what_happened: f.detail,
          numbers: f.values.map((v) => `${v.label}: ${fmtFindingValue(v)}`),
        })),
      };
    }),
    strengths: input.strengths.slice(0, 3).map((m) => ({ name: m.label, value: formatMetric(m), threshold: m.threshold })),
  };
}

export type MatchFacts = ReturnType<typeof matchFacts>;

export function planFacts(plan: TrainingPlanContent, input: { locale: Locale; playerName: string; mapName: string | null }) {
  const { locale } = input;
  return {
    language: locale === "en" ? "English" : "Polish",
    player: input.playerName,
    matches_analysed: plan.matches,
    main_map: input.mapName,
    focuses: plan.focuses.map((f, i) => {
      const c = findingCopy(f.type, locale);
      const m = f.metric;
      return {
        order: i + 1,
        type: f.type,
        title: c.title,
        category: categoryLabel(f.category, locale),
        severity_over_window: f.severity,
        why_it_costs_rounds: c.why,
        standard_advice: c.advice,
        pro_reference: c.pro,
        metric: m
          ? {
              key: m.metric,
              now: formatProgressValue(m, m.current),
              week_target: formatProgressValue(m, m.target),
              long_term_goal: m.goal != null ? formatProgressValue(m, m.goal) : null,
              better_is: m.direction,
              judged: m.status,
            }
          : null,
        moments: {
          total: f.moments.total,
          matches: f.moments.matches,
          per_match: f.moments.perMatch,
          week_target_per_match: f.moments.target,
        },
        drills: f.drills.map((d) => {
          const tx = drillText(d, locale, input.mapName);
          return { name: tx.name, how: tx.how, measure: tx.measure };
        }),
      };
    }),
    minutes_per_day: plan.days.map((d) => d.minutes),
  };
}

export type PlanFacts = ReturnType<typeof planFacts>;
