import type { MessageKey, TFunction } from "@/lib/i18n/translate";
import type { Situation } from "@/lib/norms/norms";
import { SITUATION_KEY } from "@/lib/norms/view";

/** "Celność 1. kuli · AWP" — a norm metric's label, with the weapon class when it has one. */
export function metricLabel(t: TFunction, metric: string, situation: Situation = "all"): string {
  const label = t(`norms.metric.${metric}` as MessageKey);
  return situation === "all" ? label : `${label} · ${t(SITUATION_KEY[situation])}`;
}
