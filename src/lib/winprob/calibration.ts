/**
 * Calibration of a win-probability model on stored snapshots (/admin/ml):
 * predicted P(T wins) in equal-width bins against how often T actually won,
 * plus log loss and Brier score. Every round weighs the same (like the
 * trainer), so long rounds with many snapshots do not dominate.
 *
 * Pure module, covered by `npm run test:winprob`.
 */
import { predictT, type WinProbModelSpec } from "./model";

export interface CalibrationPoint {
  /** Predicted P(T wins), 0–1. */
  p: number;
  /** 1 when T won the round. */
  y: 0 | 1;
  w: number;
}

export interface CalibrationBin {
  lo: number;
  hi: number;
  /** Snapshots in the bin. */
  n: number;
  /** Weighted mean prediction and actual T win rate, 0–1 (NaN for an empty bin). */
  predicted: number;
  actual: number;
}

export interface CalibrationReport {
  bins: CalibrationBin[];
  n: number;
  rounds: number;
  logloss: number;
  brier: number;
  /** Weighted mean |predicted − actual| over the bins. */
  ece: number;
}

/** A stored WinProbData row set: [round, tick, tWin, ...features] with null for NaN. */
export interface StoredSnapshots {
  features: string[];
  rows: Array<Array<number | null>>;
}

/** Score every stored snapshot of the matches with the model; each round weighs 1 in total. */
export function snapshotPoints(sets: StoredSnapshots[], model: WinProbModelSpec): { points: CalibrationPoint[]; rounds: number } {
  const points: CalibrationPoint[] = [];
  let rounds = 0;
  for (const set of sets) {
    const perRound = new Map<number, number>();
    for (const r of set.rows) perRound.set(Number(r[0]), (perRound.get(Number(r[0])) ?? 0) + 1);
    rounds += perRound.size;
    for (const r of set.rows) {
      const feats: Record<string, number> = {};
      set.features.forEach((name, i) => {
        const v = r[i + 3];
        feats[name] = v == null ? NaN : v;
      });
      points.push({ p: predictT(model, feats), y: r[2] === 1 ? 1 : 0, w: 1 / (perRound.get(Number(r[0])) ?? 1) });
    }
  }
  return { points, rounds };
}

export function calibrationReport(points: CalibrationPoint[], rounds: number, nBins = 10): CalibrationReport {
  const acc = Array.from({ length: nBins }, () => ({ n: 0, w: 0, p: 0, y: 0 }));
  let w = 0;
  let ll = 0;
  let brier = 0;
  for (const pt of points) {
    const p = Math.min(1 - 1e-6, Math.max(1e-6, pt.p));
    const b = acc[Math.min(nBins - 1, Math.floor(p * nBins))];
    b.n++;
    b.w += pt.w;
    b.p += pt.w * p;
    b.y += pt.w * pt.y;
    w += pt.w;
    ll -= pt.w * (pt.y === 1 ? Math.log(p) : Math.log(1 - p));
    brier += pt.w * (p - pt.y) ** 2;
  }
  const bins = acc.map((b, i) => ({
    lo: i / nBins,
    hi: (i + 1) / nBins,
    n: b.n,
    predicted: b.w > 0 ? b.p / b.w : NaN,
    actual: b.w > 0 ? b.y / b.w : NaN,
  }));
  const ece = w > 0 ? acc.reduce((a, b) => (b.w > 0 ? a + Math.abs(b.p - b.y) : a), 0) / w : NaN;
  return {
    bins,
    n: points.length,
    rounds,
    logloss: w > 0 ? ll / w : NaN,
    brier: w > 0 ? brier / w : NaN,
    ece,
  };
}
