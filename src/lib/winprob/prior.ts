/**
 * The prior win-probability model that ships with the app (S14): a logistic
 * model fitted on the ESTA pro dataset (ml/fit_prior_esta.py; sources in
 * prior-model.json), used until the trainer (ml/) has enough of this site's
 * CS2 matches to beat it. The trainer reads
 * the same JSON to compare every candidate against it.
 */
import { createHash } from "crypto";
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

/**
 * The prior's model id: changes with its numbers, so findings costs and pro
 * situations scored by an older prior are rescored like after a retrain.
 */
export const PRIOR_ID = `prior-${createHash("sha1").update(JSON.stringify(prior)).digest("hex").slice(0, 8)}`;

/** Where the prior's numbers come from (shown on /admin/ml). */
export const PRIOR_SOURCES: string[] = prior.sources;
