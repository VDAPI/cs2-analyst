/**
 * The prior win-probability model that ships with the app (S14): a logistic
 * model calibrated by hand on public round statistics (man advantage, post-
 * plant and retake conversion, buy types; sources in prior-model.json), used
 * until the trainer (ml/) has enough matches to beat it. The trainer reads
 * the same JSON to compare every candidate against it.
 */
import prior from "./prior-model.json";
import type { LogisticModel } from "./model";

export const PRIOR_MODEL: LogisticModel = {
  kind: "logistic",
  features: prior.features,
  intercept: prior.intercept,
  terms: prior.terms,
  fill: prior.fill,
  calibration: null,
};

/** Where the prior's numbers come from (shown on /admin/ml). */
export const PRIOR_SOURCES: string[] = prior.sources;
