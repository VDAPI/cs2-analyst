/**
 * Scoring a round win-probability model (S14) in TypeScript.
 *
 * Models are trained by the Python service (`ml/`) and stored as JSON in
 * `WinProbModel`; scoring them here keeps the findings, the report and the
 * replay independent of whether that service is running. Two kinds:
 *
 * - "gbdt": gradient-boosted trees exported from LightGBM (`ml/export.py`
 *   flattens `Booster.dump_model()`), same decision rule as LightGBM's
 *   NumericalDecision, including its missing-value handling.
 * - "logistic": a sum of weighted terms (a feature, or a product of
 *   features) through the logistic function. The prior that ships with the
 *   app (prior-model.json) is one, so is the logistic candidate the trainer
 *   compares against.
 *
 * Both optionally carry Platt calibration (p = σ(a·raw + b)) fitted on
 * out-of-fold scores. Output is always P(T wins the round).
 *
 * Pure module, covered by `npm run test:winprob` (against LightGBM's own
 * predictions for a committed fixture).
 */
import type { WpFeatures } from "./features";

export interface GbdtTree {
  /** Internal nodes: split feature index, threshold, children, default-left, missing type. */
  f: number[];
  t: number[];
  /** Child index: ≥ 0 an internal node, < 0 the leaf ~child. */
  l: number[];
  r: number[];
  /** 1 when missing values go left. */
  d: number[];
  /** Missing type: 0 none (NaN is treated as 0), 1 zero, 2 NaN. */
  m: number[];
  /** Leaf values. */
  v: number[];
}

export interface Calibration {
  a: number;
  b: number;
}

export interface GbdtModel {
  kind: "gbdt";
  features: string[];
  trees: GbdtTree[];
  calibration?: Calibration | null;
}

export interface LogisticTerm {
  /** Feature names multiplied together (one name = a plain linear term). */
  f: string[];
  w: number;
}

export interface LogisticModel {
  kind: "logistic";
  features: string[];
  intercept: number;
  terms: LogisticTerm[];
  /** Value used for a NaN feature (e.g. bomb distances before the plant). */
  fill: Record<string, number>;
  calibration?: Calibration | null;
}

export type WinProbModelSpec = GbdtModel | LogisticModel;

const ZERO = 1e-35;

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function treeValue(tree: GbdtTree, x: number[]): number {
  if (tree.f.length === 0) return tree.v[0] ?? 0;
  let node = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    let v = x[tree.f[node]];
    const missing = tree.m[node];
    if (Number.isNaN(v) && missing !== 2) v = 0;
    let left: boolean;
    if ((missing === 1 && Math.abs(v) <= ZERO) || (missing === 2 && Number.isNaN(v))) left = tree.d[node] === 1;
    else left = v <= tree.t[node];
    const next = left ? tree.l[node] : tree.r[node];
    if (next < 0) return tree.v[~next];
    node = next;
  }
  throw new Error("Malformed tree");
}

/** Raw score (log-odds before calibration). */
export function rawScore(model: WinProbModelSpec, features: Partial<WpFeatures> | Record<string, number>): number {
  const get = (name: string) => {
    const v = (features as Record<string, number>)[name];
    return typeof v === "number" ? v : NaN;
  };
  if (model.kind === "gbdt") {
    const x = model.features.map(get);
    let s = 0;
    for (const tree of model.trees) s += treeValue(tree, x);
    return s;
  }
  const val = (name: string) => {
    const v = get(name);
    return Number.isNaN(v) ? (model.fill[name] ?? 0) : v;
  };
  let s = model.intercept;
  for (const term of model.terms) s += term.w * term.f.reduce((a, name) => a * val(name), 1);
  return s;
}

/** P(T wins the round). */
export function predictT(model: WinProbModelSpec, features: Partial<WpFeatures> | Record<string, number>): number {
  const raw = rawScore(model, features);
  const c = model.calibration;
  const p = sigmoid(c ? c.a * raw + c.b : raw);
  // Never fully certain: a stored 0 or 1 would make every impact on that round 0.
  return Math.min(0.999, Math.max(0.001, p));
}

/** P(side wins the round). */
export function predictSide(
  model: WinProbModelSpec,
  features: Partial<WpFeatures> | Record<string, number>,
  side: "CT" | "T"
): number {
  const p = predictT(model, features);
  return side === "T" ? p : 1 - p;
}

/** Light structural check for a model read from the DB. */
export function isModelSpec(v: unknown): v is WinProbModelSpec {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  if (!Array.isArray(m.features)) return false;
  if (m.kind === "gbdt") return Array.isArray(m.trees);
  if (m.kind === "logistic") return Array.isArray(m.terms) && typeof m.intercept === "number";
  return false;
}
